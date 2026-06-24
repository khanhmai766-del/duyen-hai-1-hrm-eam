import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireRole, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

type ScopeRow = {
  id: string;
  position: string;
  systemSeq: string;
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
}

async function listScopes() {
  await ensureScopeTable();
  return prisma.$queryRaw<ScopeRow[]>`
    SELECT "id", "position", "systemSeq", "createdAt"
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
    const systemSeqs = Array.isArray(body.systemSeqs)
      ? Array.from(new Set(body.systemSeqs.map((value: unknown) => String(value).trim()).filter(Boolean)))
      : [];

    if (!position) return fail("Vui lòng chọn cương vị cần phân quyền hệ thống thiết bị");

    await ensureScopeTable();
    await prisma.$executeRaw`DELETE FROM "PositionSystemScope" WHERE "position" = ${position}`;
    for (const systemSeq of systemSeqs) {
      await prisma.$executeRaw`
        INSERT INTO "PositionSystemScope" ("id", "position", "systemSeq")
        VALUES (${randomUUID()}, ${position}, ${systemSeq})
        ON CONFLICT ("position", "systemSeq") DO NOTHING
      `;
    }
    await audit(user.id, "UPDATE_POSITION_SYSTEM_SCOPE", "PositionSystemScope", position, systemSeqs.join(", "));
    const rows = await listScopes();
    return ok(rows, { total: rows.length });
  });
}
