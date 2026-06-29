import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireRole, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

type ScopeAccess = "none" | "view" | "edit";

type ScopeRow = {
  id: string;
  position: string;
  systemSeq: string;
  access: ScopeAccess;
  createdAt: Date;
};

async function ensureScopeTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PositionSystemScope" (
      "id" TEXT NOT NULL,
      "position" TEXT NOT NULL,
      "systemSeq" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PositionSystemScope_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PositionSystemScope_position_systemSeq_key"
    ON "PositionSystemScope" ("position", "systemSeq");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PositionSystemScope_position_idx"
    ON "PositionSystemScope" ("position");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PositionSystemScope_systemSeq_idx"
    ON "PositionSystemScope" ("systemSeq");
  `);
  // Thêm cột mức quyền (view/edit). Dữ liệu cũ vốn là quyền "thao tác" → backfill thành "edit".
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'PositionSystemScope' AND column_name = 'access'
      ) THEN
        ALTER TABLE "PositionSystemScope" ADD COLUMN "access" TEXT NOT NULL DEFAULT 'view';
        UPDATE "PositionSystemScope" SET "access" = 'edit';
      END IF;
    END $$;
  `);
}

async function listScopes() {
  await ensureScopeTable();
  return prisma.$queryRaw<ScopeRow[]>`
    SELECT "id", "position", "systemSeq", "access", "createdAt"
    FROM "PositionSystemScope"
    ORDER BY "position" ASC, "systemSeq" ASC
  `;
}

export async function GET() {
  return handle(async () => {
    await requireUser();
    const rows = await listScopes();
    return ok(rows, { total: rows.length });
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    const body = await req.json();
    const position = typeof body.position === "string" ? body.position.trim() : "";

    // Payload mới: entries [{ systemSeq, access }]. Vẫn nhận systemSeqs cũ (mặc định "edit").
    const rawEntries: Array<{ systemSeq: string; access: ScopeAccess }> = Array.isArray(body.entries)
      ? body.entries
          .map((entry: { systemSeq?: unknown; access?: unknown }) => ({
            systemSeq: String(entry?.systemSeq ?? "").trim(),
            access: (entry?.access === "edit" ? "edit" : entry?.access === "view" ? "view" : "none") as ScopeAccess,
          }))
          .filter((entry: { systemSeq: string }) => entry.systemSeq)
      : Array.isArray(body.systemSeqs)
        ? body.systemSeqs
            .map((value: unknown) => ({ systemSeq: String(value).trim(), access: "edit" as ScopeAccess }))
            .filter((entry: { systemSeq: string }) => entry.systemSeq)
        : [];

    // Khử trùng theo systemSeq, giữ access mạnh hơn (edit > view).
    const bySeq = new Map<string, ScopeAccess>();
    for (const entry of rawEntries) {
      const prev = bySeq.get(entry.systemSeq);
      bySeq.set(
        entry.systemSeq,
        prev === "edit" || entry.access === "edit"
          ? "edit"
          : prev === "view" || entry.access === "view"
            ? "view"
            : "none"
      );
    }

    if (!position) return fail("Vui lòng chọn cương vị cần phân quyền hệ thống thiết bị");

    await ensureScopeTable();
    await prisma.$executeRaw`DELETE FROM "PositionSystemScope" WHERE "position" = ${position}`;
    for (const [systemSeq, access] of bySeq) {
      await prisma.$executeRaw`
        INSERT INTO "PositionSystemScope" ("id", "position", "systemSeq", "access")
        VALUES (${randomUUID()}, ${position}, ${systemSeq}, ${access})
        ON CONFLICT ("position", "systemSeq") DO UPDATE SET "access" = EXCLUDED."access"
      `;
    }
    await audit(
      user.id,
      "UPDATE_POSITION_SYSTEM_SCOPE",
      "PositionSystemScope",
      position,
      Array.from(bySeq.entries()).map(([seq, access]) => `${seq}:${access}`).join(", ")
    );
    const rows = await listScopes();
    return ok(rows, { total: rows.length });
  });
}
