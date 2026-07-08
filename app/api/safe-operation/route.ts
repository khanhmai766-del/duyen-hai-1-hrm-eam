import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const dynamic = "force-dynamic";

const SAFE_OPERATION_UNITS = ["S1", "S2"] as const;
type SafeOperationUnit = (typeof SAFE_OPERATION_UNITS)[number];
const SAFE_OPERATION_CATEGORIES = ["continuous", "standby", "maintenance", "incident"] as const;
type SafeOperationCategory = (typeof SAFE_OPERATION_CATEGORIES)[number];
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
let safeOperationConstraintReady = false;
let safeOperationDbUsesVietnamTime: boolean | null = null;

function parseUnit(value: unknown): SafeOperationUnit | null {
  const unit = String(value ?? "").trim().toUpperCase();
  return SAFE_OPERATION_UNITS.includes(unit as SafeOperationUnit) ? (unit as SafeOperationUnit) : null;
}

function parseCategory(value: unknown): SafeOperationCategory | null {
  const category = String(value ?? "").trim();
  return SAFE_OPERATION_CATEGORIES.includes(category as SafeOperationCategory) ? (category as SafeOperationCategory) : null;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatTimestampStorage(date: Date, useVietnamWallTime: boolean) {
  if (useVietnamWallTime) {
    const vietnamTime = new Date(date.getTime() + VIETNAM_OFFSET_MS);
    return [
      vietnamTime.getUTCFullYear(),
      padDatePart(vietnamTime.getUTCMonth() + 1),
      padDatePart(vietnamTime.getUTCDate()),
    ].join("-") + ` ${padDatePart(vietnamTime.getUTCHours())}:${padDatePart(vietnamTime.getUTCMinutes())}:${padDatePart(vietnamTime.getUTCSeconds())}`;
  }

  return [
    date.getUTCFullYear(),
    padDatePart(date.getUTCMonth() + 1),
    padDatePart(date.getUTCDate()),
  ].join("-") + ` ${padDatePart(date.getUTCHours())}:${padDatePart(date.getUTCMinutes())}:${padDatePart(date.getUTCSeconds())}`;
}

function parseLocalDateTime(value: unknown, dbUsesVietnamTime: boolean) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const expected = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
  const date = new Date(
    Date.UTC(
      expected.year,
      expected.month - 1,
      expected.day,
      expected.hour,
      expected.minute,
      expected.second,
    ) - VIETNAM_OFFSET_MS,
  );
  const vietnamWallTime = new Date(date.getTime() + VIETNAM_OFFSET_MS);
  if (
    Number.isNaN(date.getTime()) ||
    vietnamWallTime.getUTCFullYear() !== expected.year ||
    vietnamWallTime.getUTCMonth() !== expected.month - 1 ||
    vietnamWallTime.getUTCDate() !== expected.day ||
    vietnamWallTime.getUTCHours() !== expected.hour ||
    vietnamWallTime.getUTCMinutes() !== expected.minute
  ) {
    return null;
  }

  return {
    instant: date,
    storage: formatTimestampStorage(date, dbUsesVietnamTime),
  };
}

type SafeOperationEventRow = {
  id: string;
  unit: SafeOperationUnit;
  category: SafeOperationCategory;
  startedAt: string;
  endedAt: string | null;
  reason: string | null;
  isAdded: boolean;
  createdAt: string;
};

async function listSafeOperationEvents() {
  const dbUsesVietnamTime = await getSafeOperationDbUsesVietnamTime();
  const suffix = dbUsesVietnamTime ? "+07:00" : "Z";

  return prisma.$queryRaw<SafeOperationEventRow[]>`
    SELECT
      "id",
      "unit",
      "category",
      to_char("startedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') || ${suffix} AS "startedAt",
      CASE
        WHEN "endedAt" IS NULL THEN NULL
        ELSE to_char("endedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') || ${suffix}
      END AS "endedAt",
      "reason",
      "isAdded",
      to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') || ${suffix} AS "createdAt"
    FROM "SafeOperationEvent"
    ORDER BY "createdAt" ASC
  `;
}

async function getSafeOperationDbUsesVietnamTime() {
  if (safeOperationDbUsesVietnamTime !== null) return safeOperationDbUsesVietnamTime;
  const rows = await prisma.$queryRaw<{ TimeZone: string }[]>`SHOW timezone`;
  const timezone = String(rows[0]?.TimeZone ?? "").toLowerCase();
  safeOperationDbUsesVietnamTime = timezone === "asia/ho_chi_minh" || timezone === "asia/saigon";
  return safeOperationDbUsesVietnamTime;
}

async function ensureSafeOperationPeriodConstraint() {
  if (safeOperationConstraintReady) return;
  await prisma.$executeRaw`
    ALTER TABLE "SafeOperationEvent"
    DROP CONSTRAINT IF EXISTS "SafeOperationEvent_period_check"
  `;
  await prisma.$executeRaw`
    ALTER TABLE "SafeOperationEvent"
    ADD CONSTRAINT "SafeOperationEvent_period_check"
    CHECK (
      ("category" = 'continuous' AND "endedAt" IS NULL)
      OR
      ("category" <> 'continuous' AND ("endedAt" IS NULL OR "endedAt" > "startedAt"))
    )
  `;
  safeOperationConstraintReady = true;
}

export async function GET() {
  return handle(async () => {
    await requireUser();
    return ok(await listSafeOperationEvents());
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "operation-events", ["manage", "full"], "Không đủ quyền cập nhật vận hành an toàn");
    
    const body = await req.json();
    const unit = parseUnit(body.unit);
    const action = String(body.action ?? "");
    
    if (!unit) return fail("Tổ máy không hợp lệ");

    switch (action) {
      case "ADD_ENTRY": {
        const { category, start, end } = body;
        const dbUsesVietnamTime = await getSafeOperationDbUsesVietnamTime();
        const parsedCategory = parseCategory(category);
        const startedAt = parseLocalDateTime(start, dbUsesVietnamTime);
        const endedAt = end ? parseLocalDateTime(end, dbUsesVietnamTime) : null;
        const reason = String(body.reason ?? "").trim();
        if (!parsedCategory) return fail("Hạng mục không hợp lệ");
        if (!startedAt) return fail("Thời gian bắt đầu không hợp lệ");
        if (parsedCategory !== "continuous") {
          if (end && !endedAt) return fail("Thời gian kết thúc không hợp lệ");
          if (endedAt && endedAt.instant <= startedAt.instant) return fail("Thời gian kết thúc phải sau thời gian bắt đầu");
        }
        if (endedAt && (parsedCategory === "maintenance" || parsedCategory === "incident") && !reason) {
          return fail("Vui lòng nhập lý do");
        }
        
        await ensureSafeOperationPeriodConstraint();

        if (parsedCategory === "continuous") {
          await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`
              DELETE FROM "SafeOperationEvent"
              WHERE "unit" = ${unit} AND "category" = ${parsedCategory}
            `;
            await tx.$executeRaw`
              INSERT INTO "SafeOperationEvent" ("id", "unit", "category", "startedAt", "endedAt", "reason", "isAdded", "createdAt")
              VALUES (${randomUUID()}, ${unit}, ${parsedCategory}, CAST(${startedAt.storage} AS TIMESTAMP(3)), NULL, NULL, false, NOW())
            `;
          });
        } else {
          await prisma.$transaction(async (tx) => {
            if (endedAt) {
              const openEntry = await tx.safeOperationEvent.findFirst({
                where: { unit, category: parsedCategory, endedAt: null },
                orderBy: { createdAt: "desc" },
                select: { id: true },
              });
              if (openEntry) {
                await tx.$executeRaw`
                  UPDATE "SafeOperationEvent"
                  SET "startedAt" = CAST(${startedAt.storage} AS TIMESTAMP(3)), "endedAt" = CAST(${endedAt.storage} AS TIMESTAMP(3)), "reason" = ${reason || null}, "isAdded" = false
                  WHERE "id" = ${openEntry.id}
                `;
                return;
              }
            } else {
              await tx.$executeRaw`
                DELETE FROM "SafeOperationEvent"
                WHERE "unit" = ${unit} AND "category" = ${parsedCategory} AND "endedAt" IS NULL
              `;
            }

            await tx.$executeRaw`
              INSERT INTO "SafeOperationEvent" ("id", "unit", "category", "startedAt", "endedAt", "reason", "isAdded", "createdAt")
              VALUES (
                ${randomUUID()},
                ${unit},
                ${parsedCategory},
                CAST(${startedAt.storage} AS TIMESTAMP(3)),
                ${endedAt ? Prisma.sql`CAST(${endedAt.storage} AS TIMESTAMP(3))` : null},
                ${reason || null},
                false,
                NOW()
              )
            `;
          });
        }
        await audit(user.id, "UPDATE_SAFE_OPERATION", "SafeOperationEvent", unit, `Thêm mốc thời gian ${parsedCategory}`);
        break;
      }
      
      case "TOGGLE_ENTRY": {
        const { entryId, isAdded } = body;
        if (!entryId) return fail("Thiếu ID");

        const count = await prisma.$executeRaw`
          UPDATE "SafeOperationEvent"
          SET "isAdded" = ${Boolean(isAdded)}
          WHERE "id" = ${entryId} AND "unit" = ${unit} AND "endedAt" IS NOT NULL
        `;
        if (count === 0) return fail("Không tìm thấy mốc thời gian", 404);
        await audit(user.id, "UPDATE_SAFE_OPERATION", "SafeOperationEvent", entryId, `Cập nhật trạng thái cộng gộp ${isAdded}`);
        break;
      }

      case "REMOVE_ENTRY": {
        const { entryId } = body;
        if (!entryId) return fail("Thiếu ID");
        
        const count = await prisma.$executeRaw`
          DELETE FROM "SafeOperationEvent"
          WHERE "id" = ${entryId} AND "unit" = ${unit}
        `;
        if (count === 0) return fail("Không tìm thấy mốc thời gian", 404);
        await audit(user.id, "UPDATE_SAFE_OPERATION", "SafeOperationEvent", entryId, `Xóa mốc thời gian`);
        break;
      }

      case "RESET_CATEGORY": {
        const category = parseCategory(body.category);
        if (!category) return fail("Hạng mục không hợp lệ");
        
        await prisma.$executeRaw`
          DELETE FROM "SafeOperationEvent"
          WHERE "unit" = ${unit} AND "category" = ${category}
        `;
        await audit(user.id, "UPDATE_SAFE_OPERATION", "SafeOperationEvent", unit, `Xóa tất cả mốc của ${category}`);
        break;
      }

      default:
        return fail("Thao tác không hợp lệ");
    }

    return ok(await listSafeOperationEvents());
  });
}
