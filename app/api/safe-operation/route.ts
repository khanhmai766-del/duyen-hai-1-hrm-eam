import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const dynamic = "force-dynamic";

const SAFE_OPERATION_UNITS = ["S1", "S2"] as const;
type SafeOperationUnit = (typeof SAFE_OPERATION_UNITS)[number];

const DEFAULT_STARTS: Record<SafeOperationUnit, string> = {
  S1: "2025-12-25 07:00:00",
  S2: "2026-03-29 15:45:00",
};

async function ensureSafeOperationTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SafeOperationSetting" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "unit" TEXT NOT NULL UNIQUE,
      "startedAt" TIMESTAMP(3),
      "pausedAt" TIMESTAMP(3),
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedById" TEXT
    )
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "SafeOperationSetting"
    ALTER COLUMN "startedAt" DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3)
  `);
  for (const unit of SAFE_OPERATION_UNITS) {
    await prisma.$executeRaw`
      INSERT INTO "SafeOperationSetting" ("id", "unit", "startedAt", "updatedAt")
      VALUES (${randomUUID()}, ${unit}, ${DEFAULT_STARTS[unit]}::timestamp, NOW())
      ON CONFLICT ("unit") DO NOTHING
    `;
  }
}

function parseUnit(value: unknown): SafeOperationUnit | null {
  const unit = String(value ?? "").trim().toUpperCase();
  return SAFE_OPERATION_UNITS.includes(unit as SafeOperationUnit) ? (unit as SafeOperationUnit) : null;
}

function parseStartedAt(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]} ${iso[4]}:${iso[5]}:${iso[6] ?? "00"}`;
  const vn = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (vn) return `${vn[3]}-${vn[2]}-${vn[1]} ${vn[4] ?? "00"}:${vn[5] ?? "00"}:00`;
  return null;
}

type SafeOperationRow = { id: string; unit: string; startedAt: string | null; pausedAt: string | null; updatedAt: Date };

function safeOperationSelectSql() {
  return `
    SELECT
      "id",
      "unit",
      CASE
        WHEN "startedAt" IS NULL THEN NULL
        ELSE to_char("startedAt", 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"')
      END AS "startedAt",
      CASE
        WHEN "pausedAt" IS NULL THEN NULL
        ELSE to_char("pausedAt", 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"')
      END AS "pausedAt",
      "updatedAt"
    FROM "SafeOperationSetting"
  `;
}

export async function GET() {
  return handle(async () => {
    await requireUser();
    await ensureSafeOperationTable();
    const rows = await prisma.$queryRawUnsafe<SafeOperationRow[]>(`${safeOperationSelectSql()} ORDER BY "unit" ASC`);
    return ok(rows);
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "operation-events", ["manage", "full"], "Không đủ quyền cập nhật vận hành an toàn");
    await ensureSafeOperationTable();
    const body = await req.json();
    const unit = parseUnit(body.unit);
    const action = String(body.action ?? "SET_START");
    if (!unit) return fail("Tổ máy không hợp lệ");

    if (action === "SET_START") {
      const startedAt = parseStartedAt(body.startedAt);
      if (!startedAt) return fail("Ngày bắt đầu vận hành an toàn không hợp lệ");
      await prisma.$executeRaw`
        INSERT INTO "SafeOperationSetting" ("id", "unit", "startedAt", "pausedAt", "updatedAt", "updatedById")
        VALUES (${randomUUID()}, ${unit}, ${startedAt}::timestamp, NULL, NOW(), ${user.id})
        ON CONFLICT ("unit") DO UPDATE SET
          "startedAt" = EXCLUDED."startedAt",
          "pausedAt" = NULL,
          "updatedAt" = NOW(),
          "updatedById" = EXCLUDED."updatedById"
      `;
    } else if (action === "TOGGLE_PAUSE") {
      const [current] = await prisma.$queryRaw<Array<{ startedAt: Date | null; pausedAt: Date | null }>>`
        SELECT "startedAt", "pausedAt"
        FROM "SafeOperationSetting"
        WHERE "unit" = ${unit}
        LIMIT 1
      `;
      if (!current?.startedAt) return fail("Chưa thiết lập mốc vận hành an toàn");
      if (current.pausedAt) {
        await prisma.$executeRaw`
          UPDATE "SafeOperationSetting"
          SET
            "startedAt" = "startedAt" + ((NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') - "pausedAt"),
            "pausedAt" = NULL,
            "updatedAt" = NOW(),
            "updatedById" = ${user.id}
          WHERE "unit" = ${unit}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE "SafeOperationSetting"
          SET "pausedAt" = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'), "updatedAt" = NOW(), "updatedById" = ${user.id}
          WHERE "unit" = ${unit}
        `;
      }
    } else if (action === "RESET") {
      await prisma.$executeRaw`
        UPDATE "SafeOperationSetting"
        SET "startedAt" = NULL, "pausedAt" = NULL, "updatedAt" = NOW(), "updatedById" = ${user.id}
        WHERE "unit" = ${unit}
      `;
    } else {
      return fail("Thao tác không hợp lệ");
    }

    const [row] = await prisma.$queryRawUnsafe<SafeOperationRow[]>(
      `${safeOperationSelectSql()} WHERE "unit" = $1 LIMIT 1`,
      unit
    );
    await audit(user.id, "UPDATE_SAFE_OPERATION", "SafeOperationSetting", unit, `Cập nhật vận hành an toàn ${unit}: ${action}`);
    return ok(row);
  });
}
