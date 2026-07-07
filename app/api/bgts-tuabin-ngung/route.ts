import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  BGTS_TUABIN_NGUNG_FIELD_KEYS,
  BGTS_TUABIN_NGUNG_HOURS,
  type BgtsTuabinNgungFieldKey,
} from "@/lib/bgts-tuabin-ngung";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_UNITS = new Set(["S1", "S2"]);
const VALID_HOURS = new Set<number>(BGTS_TUABIN_NGUNG_HOURS);
const VALID_CONFIRM_SHIFTS = new Set(["day", "middle", "night"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";
const SHIFT_HOURS = {
  day: new Set([7, 9, 11, 13]),
  middle: new Set([15, 17, 19, 21]),
  night: new Set([23, 1, 3, 5]),
} as const;

let tablesReady = false;

async function ensureTables() {
  if (tablesReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BgtsTurbineShutdownRecord" (
      id TEXT PRIMARY KEY,
      unit TEXT NOT NULL,
      date TEXT NOT NULL,
      "dayShiftSigner" TEXT,
      "middleShiftSigner" TEXT,
      "nightShiftSigner" TEXT,
      "dayShiftConfirmedAt" TIMESTAMP(3),
      "middleShiftConfirmedAt" TIMESTAMP(3),
      "nightShiftConfirmedAt" TIMESTAMP(3),
      "createdById" TEXT,
      "updatedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "BgtsTurbineShutdownRecord"
      ADD COLUMN IF NOT EXISTS "dayShiftConfirmedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "middleShiftConfirmedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "nightShiftConfirmedAt" TIMESTAMP(3)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "BgtsTurbineShutdownRecord_unit_date_key"
      ON "BgtsTurbineShutdownRecord"(unit, date)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "BgtsTurbineShutdownRecord_date_idx"
      ON "BgtsTurbineShutdownRecord"(date)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BgtsTurbineShutdownRow" (
      id TEXT PRIMARY KEY,
      "recordId" TEXT NOT NULL REFERENCES "BgtsTurbineShutdownRecord"(id) ON DELETE CASCADE,
      "timeHour" INTEGER NOT NULL,
      "turbineLubeOilPressure" DOUBLE PRECISION,
      "shaftJackingOilPressure" DOUBLE PRECISION,
      "rotateSpeed" DOUBLE PRECISION,
      "turningGearElectricity" DOUBLE PRECISION,
      "eccentricity" DOUBLE PRECISION,
      "hpMpCasingExpansionLeft" DOUBLE PRECISION,
      "hpMpCasingExpansionRight" DOUBLE PRECISION,
      "axialDisplacement" DOUBLE PRECISION,
      "hpMpCasingDifferentialExpansion" DOUBLE PRECISION,
      "lpCasingDifferentialExpansion" DOUBLE PRECISION,
      "hpMainSteamValveWallTempInside" DOUBLE PRECISION,
      "hpMainSteamValveWallTempOutside" DOUBLE PRECISION,
      "hpRegulatingValveWallTempInside" DOUBLE PRECISION,
      "hpRegulatingValveWallTempOutside" DOUBLE PRECISION,
      "hpInnerCasingLowerPartTempInside" DOUBLE PRECISION,
      "hpInnerCasingLowerPartTempOutside" DOUBLE PRECISION,
      "hpExhaustOuterCasingInnerWallTempTop" DOUBLE PRECISION,
      "hpExhaustOuterCasingInnerWallTempLower" DOUBLE PRECISION,
      "hpExhaustPipeTempLeft1" DOUBLE PRECISION,
      "hpExhaustPipeTempLeft2" DOUBLE PRECISION,
      "hpExhaustPipeTempRight1" DOUBLE PRECISION,
      "hpExhaustPipeTempRight2" DOUBLE PRECISION,
      "mpIntakeMetalTempInnerWall" DOUBLE PRECISION,
      "mpIntakeMetalTempOuterWall" DOUBLE PRECISION,
      "mpExhaustInnerWallTempTop" DOUBLE PRECISION,
      "mpExhaustInnerWallTempLower" DOUBLE PRECISION
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "BgtsTurbineShutdownRow_recordId_timeHour_key"
      ON "BgtsTurbineShutdownRow"("recordId", "timeHour")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "BgtsTurbineShutdownRow_recordId_idx"
      ON "BgtsTurbineShutdownRow"("recordId")
  `);
  tablesReady = true;
}

function normalizeUnit(value: unknown) {
  const unit = String(value ?? "").trim().toUpperCase();
  return VALID_UNITS.has(unit) ? unit : null;
}

function normalizeDate(value: unknown) {
  const date = String(value ?? "").trim();
  return DATE_PATTERN.test(date) ? date : null;
}

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw fail("Thông số nhập không hợp lệ");
  return number;
}

function normalizeConfirmShift(value: unknown) {
  const shift = String(value ?? "").trim();
  return VALID_CONFIRM_SHIFTS.has(shift) ? (shift as "day" | "middle" | "night") : null;
}

function lockedShiftForHour(hour: number, record: DbRecord | null) {
  if (record?.dayShiftConfirmedAt && SHIFT_HOURS.day.has(hour)) return "day";
  if (record?.middleShiftConfirmedAt && SHIFT_HOURS.middle.has(hour)) return "middle";
  if (record?.nightShiftConfirmedAt && SHIFT_HOURS.night.has(hour)) return "night";
  return null;
}

function vietnamTimestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`;
}

type DbRecord = {
  id: string;
  unit: string;
  date: string;
  dayShiftSigner: string | null;
  middleShiftSigner: string | null;
  nightShiftSigner: string | null;
  dayShiftConfirmedAt: string | null;
  middleShiftConfirmedAt: string | null;
  nightShiftConfirmedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
};

async function loadRecord(unit: string, date: string) {
  const records = await prisma.$queryRawUnsafe<DbRecord[]>(
    `
      SELECT
        id,
        unit,
        "date",
        "dayShiftSigner",
        "middleShiftSigner",
        "nightShiftSigner",
        to_char("dayShiftConfirmedAt", 'YYYY-MM-DD HH24:MI:SS') AS "dayShiftConfirmedAt",
        to_char("middleShiftConfirmedAt", 'YYYY-MM-DD HH24:MI:SS') AS "middleShiftConfirmedAt",
        to_char("nightShiftConfirmedAt", 'YYYY-MM-DD HH24:MI:SS') AS "nightShiftConfirmedAt",
        "createdAt",
        "updatedAt"
      FROM "BgtsTurbineShutdownRecord"
      WHERE unit = $1 AND date = $2
      LIMIT 1
    `,
    unit,
    date
  );
  const record = records[0] ?? null;
  if (!record) return { record: null, rows: [] };

  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `
      SELECT id, "recordId", "timeHour", ${BGTS_TUABIN_NGUNG_FIELD_KEYS.map((key) => `"${key}"`).join(", ")}
      FROM "BgtsTurbineShutdownRow"
      WHERE "recordId" = $1
      ORDER BY "timeHour" ASC
    `,
    record.id
  );

  return { record, rows };
}

async function loadArchive(unit: string) {
  const items = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      unit: string;
      date: string;
      dayShiftSigner: string | null;
      middleShiftSigner: string | null;
      nightShiftSigner: string | null;
      dayShiftConfirmedAt: string | null;
      middleShiftConfirmedAt: string | null;
      nightShiftConfirmedAt: string | null;
      updatedAt: string;
    }>
  >(
    `
      SELECT
        id,
        unit,
        date,
        "dayShiftSigner",
        "middleShiftSigner",
        "nightShiftSigner",
        to_char("dayShiftConfirmedAt", 'YYYY-MM-DD HH24:MI:SS') AS "dayShiftConfirmedAt",
        to_char("middleShiftConfirmedAt", 'YYYY-MM-DD HH24:MI:SS') AS "middleShiftConfirmedAt",
        to_char("nightShiftConfirmedAt", 'YYYY-MM-DD HH24:MI:SS') AS "nightShiftConfirmedAt",
        to_char("updatedAt", 'YYYY-MM-DD HH24:MI:SS') AS "updatedAt"
      FROM "BgtsTurbineShutdownRecord"
      WHERE unit = $1
      ORDER BY "date" DESC
    `,
    unit
  );
  return { items };
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "archive-grid-separation", ["read", "own", "create", "approve", "manage", "full"], "Bạn không có quyền xem BGTS Tuabin ngừng");
    await ensureTables();

    const unit = normalizeUnit(req.nextUrl.searchParams.get("unit"));
    if (!unit) return fail("Tổ máy không hợp lệ");
    if (req.nextUrl.searchParams.get("archive") === "1") {
      return ok(await loadArchive(unit));
    }

    const date = normalizeDate(req.nextUrl.searchParams.get("date"));
    if (!date) return fail("Ngày ghi thông số không hợp lệ");

    return ok(await loadRecord(unit, date));
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "archive-grid-separation", ["create", "manage", "full"], "Bạn không có quyền lưu BGTS Tuabin ngừng");
    await ensureTables();

    const body = (await req.json()) as Record<string, unknown>;
    const unit = normalizeUnit(body.unit);
    const date = normalizeDate(body.date);
    const confirmShift = normalizeConfirmShift(body.confirmShift);
    if (!unit) return fail("Tổ máy không hợp lệ");
    if (!date) return fail("Ngày ghi thông số không hợp lệ");

    const existingData = await loadRecord(unit, date);
    const existingRecord = existingData.record;
    const existingRowsByHour = new Map(existingData.rows.map((row) => [Number(row.timeHour), row]));

    const rawRows = Array.isArray(body.rows) ? body.rows : [];
    const rows = rawRows.map((raw) => {
      const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const timeHour = Number(item.timeHour);
      if (!VALID_HOURS.has(timeHour)) throw fail("Mốc giờ ghi thông số không hợp lệ");
      const values = Object.fromEntries(
        BGTS_TUABIN_NGUNG_FIELD_KEYS.map((key) => [key, normalizeNumber(item[key])])
      ) as Record<BgtsTuabinNgungFieldKey, number | null>;
      return { timeHour, values };
    });

    if (rows.length !== BGTS_TUABIN_NGUNG_HOURS.length) return fail("Vui lòng gửi đủ 12 mốc giờ ghi thông số");

    if (confirmShift === "day" && existingRecord?.dayShiftConfirmedAt) return fail("Ca sáng đã được xác nhận");
    if (confirmShift === "middle" && existingRecord?.middleShiftConfirmedAt) return fail("Ca chiều đã được xác nhận");
    if (confirmShift === "night" && existingRecord?.nightShiftConfirmedAt) return fail("Ca đêm đã được xác nhận");

    const now = vietnamTimestamp();
    const dayShiftConfirmedAt = existingRecord?.dayShiftConfirmedAt ?? (confirmShift === "day" ? now : null);
    const middleShiftConfirmedAt = existingRecord?.middleShiftConfirmedAt ?? (confirmShift === "middle" ? now : null);
    const nightShiftConfirmedAt = existingRecord?.nightShiftConfirmedAt ?? (confirmShift === "night" ? now : null);
    const dayShiftSigner = existingRecord?.dayShiftConfirmedAt ? existingRecord.dayShiftSigner : normalizeText(body.dayShiftSigner);
    const middleShiftSigner = existingRecord?.middleShiftConfirmedAt ? existingRecord.middleShiftSigner : normalizeText(body.middleShiftSigner);
    const nightShiftSigner = existingRecord?.nightShiftConfirmedAt ? existingRecord.nightShiftSigner : normalizeText(body.nightShiftSigner);

    await prisma.$transaction(async (tx) => {
      const recordId = randomUUID();
      const records = await tx.$queryRawUnsafe<{ id: string }[]>(
        `
          INSERT INTO "BgtsTurbineShutdownRecord" (
            id,
            unit,
            date,
            "dayShiftSigner",
            "middleShiftSigner",
            "nightShiftSigner",
            "dayShiftConfirmedAt",
            "middleShiftConfirmedAt",
            "nightShiftConfirmedAt",
            "createdById",
            "updatedById"
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::timestamp, $8::timestamp, $9::timestamp, $10, $10)
          ON CONFLICT (unit, date) DO UPDATE SET
            "dayShiftSigner" = EXCLUDED."dayShiftSigner",
            "middleShiftSigner" = EXCLUDED."middleShiftSigner",
            "nightShiftSigner" = EXCLUDED."nightShiftSigner",
            "dayShiftConfirmedAt" = COALESCE("BgtsTurbineShutdownRecord"."dayShiftConfirmedAt", EXCLUDED."dayShiftConfirmedAt"),
            "middleShiftConfirmedAt" = COALESCE("BgtsTurbineShutdownRecord"."middleShiftConfirmedAt", EXCLUDED."middleShiftConfirmedAt"),
            "nightShiftConfirmedAt" = COALESCE("BgtsTurbineShutdownRecord"."nightShiftConfirmedAt", EXCLUDED."nightShiftConfirmedAt"),
            "updatedById" = EXCLUDED."updatedById",
            "updatedAt" = CURRENT_TIMESTAMP
          RETURNING id
        `,
        recordId,
        unit,
        date,
        dayShiftSigner,
        middleShiftSigner,
        nightShiftSigner,
        dayShiftConfirmedAt,
        middleShiftConfirmedAt,
        nightShiftConfirmedAt,
        user.id
      );

      const savedRecordId = records[0]?.id;
      if (!savedRecordId) throw fail("Không thể lưu bảng BGTS Tuabin ngừng", 500);

      const columnList = BGTS_TUABIN_NGUNG_FIELD_KEYS.map((key) => `"${key}"`).join(", ");
      const excludedUpdates = BGTS_TUABIN_NGUNG_FIELD_KEYS.map((key) => `"${key}" = EXCLUDED."${key}"`).join(", ");
      const valuePlaceholders = BGTS_TUABIN_NGUNG_FIELD_KEYS.map((_, index) => `$${index + 4}`).join(", ");

      for (const row of rows) {
        const lockedShift = lockedShiftForHour(row.timeHour, existingRecord);
        const existingRow = existingRowsByHour.get(row.timeHour);
        const rowValues = lockedShift && existingRow
          ? Object.fromEntries(BGTS_TUABIN_NGUNG_FIELD_KEYS.map((key) => [key, existingRow[key] ?? null])) as Record<BgtsTuabinNgungFieldKey, number | null>
          : row.values;

        await tx.$executeRawUnsafe(
          `
            INSERT INTO "BgtsTurbineShutdownRow" (id, "recordId", "timeHour", ${columnList})
            VALUES ($1, $2, $3, ${valuePlaceholders})
            ON CONFLICT ("recordId", "timeHour") DO UPDATE SET ${excludedUpdates}
          `,
          randomUUID(),
          savedRecordId,
          row.timeHour,
          ...BGTS_TUABIN_NGUNG_FIELD_KEYS.map((key) => rowValues[key])
        );
      }
    });

    const saved = await loadRecord(unit, date);
    await audit(user.id, "UPSERT_BGTS_TUABIN_NGUNG", "BgtsTurbineShutdownRecord", saved.record?.id, `${unit} - ${date}`);
    return ok(saved);
  });
}
