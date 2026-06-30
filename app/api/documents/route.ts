import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireRole, requireUser } from "@/lib/api";
import { maybeUploadDataUrlList } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ONLY = ["ADMIN"];
const CATEGORIES = new Set(["PROCEDURE", "PID", "ARCHIVE", "GRID_SEPARATION", "STARTUP_DATA", "BOILER_CALIBRATION", "MAJOR_REPAIR"]);
const OPTIONAL_DOCUMENT_URL_CATEGORIES = new Set(["GRID_SEPARATION", "STARTUP_DATA"]);
const ARCHIVE_EDIT_CATEGORIES = new Set(["ARCHIVE", "GRID_SEPARATION", "STARTUP_DATA", "BOILER_CALIBRATION", "MAJOR_REPAIR"]);
const DOCUMENT_EDITOR_ROLES = new Set(["ADMIN", "SUPERVISOR", "TECHNICIAN"]);
const OPERATION_DOCUMENT_CATEGORIES = new Set(["PROCEDURE", "PID"]);
const OPERATION_DOCUMENT_ROLES = new Set(["ADMIN", "TECHNICIAN"]);

async function ensureDigitalDocumentTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DigitalDocument" (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      "decisionNumber" TEXT,
      "issueDate" TIMESTAMP(3),
      "documentUrl" TEXT NOT NULL,
      "managingPosition" TEXT,
      "managementBlock" TEXT,
      "procedureType" TEXT,
      "reason" TEXT,
      "progress" TEXT,
      "note" TEXT,
      "attachmentUrls" TEXT,
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
  await prisma.$executeRawUnsafe(`ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "issueDate" TIMESTAMP(3)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "managementBlock" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "procedureType" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "reason" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "progress" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "note" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "attachmentUrls" TEXT`);
}

function normalizeCategory(value: string | null | undefined) {
  const category = String(value ?? "").trim().toUpperCase();
  return CATEGORIES.has(category) ? category : null;
}

function normalizeBody(body: Record<string, unknown>) {
  const attachmentUrls = Array.isArray(body.attachmentUrls)
    ? body.attachmentUrls
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.startsWith("data:image/") || /^https?:\/\//i.test(value))
        .slice(0, 2)
    : [];

  return {
    title: String(body.title ?? "").trim(),
    decisionNumber: String(body.decisionNumber ?? "").trim() || null,
    issueDate: String(body.issueDate ?? "").trim() || null,
    documentUrl: String(body.documentUrl ?? "").trim(),
    managingPosition: String(body.managingPosition ?? "").trim() || null,
    managementBlock: String(body.managementBlock ?? "").trim() || null,
    procedureType: String(body.procedureType ?? "").trim() || null,
    reason: String(body.reason ?? "").trim() || null,
    progress: String(body.progress ?? "").trim() || null,
    note: String(body.note ?? "").trim() || null,
    attachmentUrls,
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
          d."issueDate",
          d."documentUrl",
          d."managingPosition",
          d."managementBlock",
          d."procedureType",
          d."reason",
          d."progress",
          d."note",
          COALESCE(NULLIF(d."attachmentUrls", '')::json, '[]'::json) AS "attachmentUrls",
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
    await ensureDigitalDocumentTable();

    const body = (await req.json()) as Record<string, unknown>;
    const category = normalizeCategory(String(body.category ?? ""));
    if (!category) return fail("Danh mục tài liệu không hợp lệ");
    if (OPERATION_DOCUMENT_CATEGORIES.has(category)) {
      if (!OPERATION_DOCUMENT_ROLES.has(user.role)) return fail("Bạn không có quyền thêm tài liệu vận hành", 403);
    } else {
      requireRole(user, ADMIN_ONLY);
    }

    const payload = normalizeBody(body);
    payload.attachmentUrls = await maybeUploadDataUrlList(payload.attachmentUrls, "digital-documents/attachments", "document-image");
    if (!payload.title) return fail("Vui lòng nhập tên tài liệu");
    if (!OPTIONAL_DOCUMENT_URL_CATEGORIES.has(category) && !payload.documentUrl) return fail("Vui lòng nhập nội dung hoặc link tài liệu");

    const id = randomUUID();
    const rows = await prisma.$queryRawUnsafe(
      `
        INSERT INTO "DigitalDocument" (id, category, title, "decisionNumber", "issueDate", "documentUrl", "managingPosition", "managementBlock", "procedureType", "reason", "progress", "note", "attachmentUrls", "createdById", "updatedById")
        VALUES ($1, $2, $3, $4, $5::timestamp, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
        RETURNING id, category, title, "decisionNumber", "issueDate", "documentUrl", "managingPosition", "managementBlock", "procedureType", "reason", "progress", "note", COALESCE(NULLIF("attachmentUrls", '')::json, '[]'::json) AS "attachmentUrls", "createdAt", "updatedAt"
      `,
      id,
      category,
      payload.title,
      payload.decisionNumber,
      payload.issueDate,
      payload.documentUrl,
      payload.managingPosition,
      payload.managementBlock,
      payload.procedureType,
      payload.reason,
      payload.progress,
      payload.note,
      JSON.stringify(payload.attachmentUrls),
      user.id
    );

    await audit(user.id, "CREATE_DIGITAL_DOCUMENT", "DigitalDocument", id, payload.title);
    return ok(Array.isArray(rows) ? rows[0] : { id });
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await ensureDigitalDocumentTable();

    const body = (await req.json()) as Record<string, unknown>;
    const id = String(body.id ?? "").trim();
    const category = normalizeCategory(String(body.category ?? ""));
    if (!id) return fail("Thiếu id tài liệu");
    if (!category) return fail("Danh mục tài liệu không hợp lệ");
    const canEditOperationDocument = OPERATION_DOCUMENT_CATEGORIES.has(category) && OPERATION_DOCUMENT_ROLES.has(user.role);
    const canEditArchiveDocument = DOCUMENT_EDITOR_ROLES.has(user.role) && (user.role === "ADMIN" || ARCHIVE_EDIT_CATEGORIES.has(category));
    if (!canEditOperationDocument && !canEditArchiveDocument) {
      return fail("Bạn không có quyền chỉnh sửa tài liệu", 403);
    }

    const payload = normalizeBody(body);
    payload.attachmentUrls = await maybeUploadDataUrlList(payload.attachmentUrls, "digital-documents/attachments", "document-image");
    if (!payload.title) return fail("Vui lòng nhập tên tài liệu");
    if (!OPTIONAL_DOCUMENT_URL_CATEGORIES.has(category) && !payload.documentUrl) return fail("Vui lòng nhập nội dung hoặc link tài liệu");

    const rows = await prisma.$queryRawUnsafe(
      `
        UPDATE "DigitalDocument"
        SET
          title = $3,
          "decisionNumber" = $4,
          "issueDate" = $5::timestamp,
          "documentUrl" = $6,
          "managingPosition" = $7,
          "managementBlock" = $8,
          "procedureType" = $9,
          "reason" = $10,
          "progress" = $11,
          "note" = $12,
          "attachmentUrls" = $13,
          "updatedById" = $14,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = $1 AND category = $2
        RETURNING id, category, title, "decisionNumber", "issueDate", "documentUrl", "managingPosition", "managementBlock", "procedureType", "reason", "progress", "note", COALESCE(NULLIF("attachmentUrls", '')::json, '[]'::json) AS "attachmentUrls", "createdAt", "updatedAt"
      `,
      id,
      category,
      payload.title,
      payload.decisionNumber,
      payload.issueDate,
      payload.documentUrl,
      payload.managingPosition,
      payload.managementBlock,
      payload.procedureType,
      payload.reason,
      payload.progress,
      payload.note,
      JSON.stringify(payload.attachmentUrls),
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
    await ensureDigitalDocumentTable();

    const id = req.nextUrl.searchParams.get("id")?.trim();
    const category = normalizeCategory(req.nextUrl.searchParams.get("category"));
    if (!id) return fail("Thiếu id tài liệu");
    if (!category) return fail("Danh mục tài liệu không hợp lệ");
    if (!OPERATION_DOCUMENT_CATEGORIES.has(category) || !OPERATION_DOCUMENT_ROLES.has(user.role)) {
      requireRole(user, ADMIN_ONLY);
    }

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
