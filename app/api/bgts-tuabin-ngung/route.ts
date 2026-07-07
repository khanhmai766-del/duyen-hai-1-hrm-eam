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
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
      "createdById" TEXT,
      "updatedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
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

type DbRecord = {
  id: string;
  unit: string;
  date: string;
  dayShiftSigner: string | null;
  middleShiftSigner: string | null;
  nightShiftSigner: string | null;
  createdAt: Date;
  updatedAt: Date;
};

async function loadRecord(unit: string, date: string) {
  const records = await prisma.$queryRawUnsafe<DbRecord[]>(
    `
      SELECT id, unit, date, "dayShiftSigner", "middleShiftSigner", "nightShiftSigner", "createdAt", "updatedAt"
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

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    await ensureTables();

    const unit = normalizeUnit(req.nextUrl.searchParams.get("unit"));
    const date = normalizeDate(req.nextUrl.searchParams.get("date"));
    if (!unit) return fail("Tổ máy không hợp lệ");
    if (!date) return fail("Ngày ghi thông số không hợp lệ");

    return ok(await loadRecord(unit, date));
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "archive-edit", ["create", "manage", "full"], "Bạn không có quyền lưu BGTS Tuabin ngừng");
    await ensureTables();

    const body = (await req.json()) as Record<string, unknown>;
    const unit = normalizeUnit(body.unit);
    const date = normalizeDate(body.date);
    if (!unit) return fail("Tổ máy không hợp lệ");
    if (!date) return fail("Ngày ghi thông số không hợp lệ");

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

    await prisma.$transaction(async (tx) => {
      const recordId = randomUUID();
      const records = await tx.$queryRawUnsafe<{ id: string }[]>(
        `
          INSERT INTO "BgtsTurbineShutdownRecord" (
            id, unit, date, "dayShiftSigner", "middleShiftSigner", "nightShiftSigner", "createdById", "updatedById"
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
          ON CONFLICT (unit, date) DO UPDATE SET
            "dayShiftSigner" = EXCLUDED."dayShiftSigner",
            "middleShiftSigner" = EXCLUDED."middleShiftSigner",
            "nightShiftSigner" = EXCLUDED."nightShiftSigner",
            "updatedById" = EXCLUDED."updatedById",
            "updatedAt" = CURRENT_TIMESTAMP
          RETURNING id
        `,
        recordId,
        unit,
        date,
        normalizeText(body.dayShiftSigner),
        normalizeText(body.middleShiftSigner),
        normalizeText(body.nightShiftSigner),
        user.id
      );

      const savedRecordId = records[0]?.id;
      if (!savedRecordId) throw fail("Không thể lưu bảng BGTS Tuabin ngừng", 500);

      const columnList = BGTS_TUABIN_NGUNG_FIELD_KEYS.map((key) => `"${key}"`).join(", ");
      const excludedUpdates = BGTS_TUABIN_NGUNG_FIELD_KEYS.map((key) => `"${key}" = EXCLUDED."${key}"`).join(", ");
      const valuePlaceholders = BGTS_TUABIN_NGUNG_FIELD_KEYS.map((_, index) => `$${index + 4}`).join(", ");

      for (const row of rows) {
        await tx.$executeRawUnsafe(
          `
            INSERT INTO "BgtsTurbineShutdownRow" (id, "recordId", "timeHour", ${columnList})
            VALUES ($1, $2, $3, ${valuePlaceholders})
            ON CONFLICT ("recordId", "timeHour") DO UPDATE SET ${excludedUpdates}
          `,
          randomUUID(),
          savedRecordId,
          row.timeHour,
          ...BGTS_TUABIN_NGUNG_FIELD_KEYS.map((key) => row.values[key])
        );
      }
    });

    const saved = await loadRecord(unit, date);
    await audit(user.id, "UPSERT_BGTS_TUABIN_NGUNG", "BgtsTurbineShutdownRecord", saved.record?.id, `${unit} - ${date}`);
    return ok(saved);
  });
}
