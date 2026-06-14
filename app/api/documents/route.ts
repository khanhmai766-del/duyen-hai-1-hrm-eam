import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireRole, requireUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ONLY = ["ADMIN"];
const CATEGORIES = new Set(["PROCEDURE", "PID"]);

async function ensureDigitalDocumentTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DigitalDocument" (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      "decisionNumber" TEXT,
      "documentUrl" TEXT NOT NULL,
      "managingPosition" TEXT,
      "managementBlock" TEXT,
      "createdById" TEXT,
      "updatedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "DigitalDocument_category_updatedAt_idx"
    ON "DigitalDocument" (category, "updatedAt" DESC)
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "managingPosition" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "managementBlock" TEXT`);
}

function normalizeCategory(value: string | null | undefined) {
  const category = String(value ?? "").trim().toUpperCase();
  return CATEGORIES.has(category) ? category : null;
}

function normalizeBody(body: Record<string, unknown>) {
  return {
    title: String(body.title ?? "").trim(),
    decisionNumber: String(body.decisionNumber ?? "").trim() || null,
    documentUrl: String(body.documentUrl ?? "").trim(),
    managingPosition: String(body.managingPosition ?? "").trim() || null,
    managementBlock: String(body.managementBlock ?? "").trim() || null,
  };
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    await ensureDigitalDocumentTable();

    const category = normalizeCategory(req.nextUrl.searchParams.get("category"));
    if (!category) return fail("Danh mục tài liệu không hợp lệ");

    const items = await prisma.$queryRawUnsafe(
      `
        SELECT
          d.id,
          d.category,
          d.title,
          d."decisionNumber",
          d."documentUrl",
          d."managingPosition",
          d."managementBlock",
          d."createdAt",
          d."updatedAt",
          json_build_object(
            'id', cu.id,
            'name', cu.name,
            'position', cu.position,
            'avatarUrl', cu."avatarUrl"
          ) AS "createdBy",
          json_build_object(
            'id', uu.id,
            'name', uu.name,
            'position', uu.position,
            'avatarUrl', uu."avatarUrl"
          ) AS "updatedBy"
        FROM "DigitalDocument" d
        LEFT JOIN "User" cu ON cu.id = d."createdById"
        LEFT JOIN "User" uu ON uu.id = d."updatedById"
        WHERE d.category = $1
        ORDER BY d."updatedAt" DESC, d."createdAt" DESC
      `,
      category
    );

    return ok(items);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ADMIN_ONLY);
    await ensureDigitalDocumentTable();

    const body = (await req.json()) as Record<string, unknown>;
    const category = normalizeCategory(String(body.category ?? ""));
    if (!category) return fail("Danh mục tài liệu không hợp lệ");

    const payload = normalizeBody(body);
    if (!payload.title) return fail("Vui lòng nhập tên tài liệu");
    if (!payload.documentUrl) return fail("Vui lòng nhập link tài liệu liên kết");

    const id = randomUUID();
    const rows = await prisma.$queryRawUnsafe(
      `
        INSERT INTO "DigitalDocument" (id, category, title, "decisionNumber", "documentUrl", "managingPosition", "managementBlock", "createdById", "updatedById")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
        RETURNING id, category, title, "decisionNumber", "documentUrl", "managingPosition", "managementBlock", "createdAt", "updatedAt"
      `,
      id,
      category,
      payload.title,
      payload.decisionNumber,
      payload.documentUrl,
      payload.managingPosition,
      payload.managementBlock,
      user.id
    );

    await audit(user.id, "CREATE_DIGITAL_DOCUMENT", "DigitalDocument", id, payload.title);
    return ok(Array.isArray(rows) ? rows[0] : { id });
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ADMIN_ONLY);
    await ensureDigitalDocumentTable();

    const body = (await req.json()) as Record<string, unknown>;
    const id = String(body.id ?? "").trim();
    const category = normalizeCategory(String(body.category ?? ""));
    if (!id) return fail("Thiếu id tài liệu");
    if (!category) return fail("Danh mục tài liệu không hợp lệ");

    const payload = normalizeBody(body);
    if (!payload.title) return fail("Vui lòng nhập tên tài liệu");
    if (!payload.documentUrl) return fail("Vui lòng nhập link tài liệu liên kết");

    const rows = await prisma.$queryRawUnsafe(
      `
        UPDATE "DigitalDocument"
        SET
          title = $3,
          "decisionNumber" = $4,
          "documentUrl" = $5,
          "managingPosition" = $6,
          "managementBlock" = $7,
          "updatedById" = $8,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = $1 AND category = $2
        RETURNING id, category, title, "decisionNumber", "documentUrl", "managingPosition", "managementBlock", "createdAt", "updatedAt"
      `,
      id,
      category,
      payload.title,
      payload.decisionNumber,
      payload.documentUrl,
      payload.managingPosition,
      payload.managementBlock,
      user.id
    );

    const item = Array.isArray(rows) ? rows[0] : null;
    if (!item) return fail("Không tìm thấy tài liệu", 404);
    await audit(user.id, "UPDATE_DIGITAL_DOCUMENT", "DigitalDocument", id, payload.title);
    return ok(item);
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ADMIN_ONLY);
    await ensureDigitalDocumentTable();

    const id = req.nextUrl.searchParams.get("id")?.trim();
    const category = normalizeCategory(req.nextUrl.searchParams.get("category"));
    if (!id) return fail("Thiếu id tài liệu");
    if (!category) return fail("Danh mục tài liệu không hợp lệ");

    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM "DigitalDocument" WHERE id = $1 AND category = $2`,
      id,
      category
    );

    if (!deleted) return fail("Không tìm thấy tài liệu", 404);
    await audit(user.id, "DELETE_DIGITAL_DOCUMENT", "DigitalDocument", id);
    return ok({ id });
  });
}
