import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { maybeUploadDataUrlList } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { archiveCategoryPermissionId } from "@/lib/archive-permissions";
import { OIL_SOOT_GATED_CATEGORIES } from "@/lib/oil-soot-access";
import { assertOilSootAccess } from "@/lib/server-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = new Set(["PROCEDURE", "PID", "ARCHIVE", "GRID_SEPARATION", "STARTUP_DATA", "BOILER_CALIBRATION", "MAJOR_REPAIR", "OIL_GUN_DATA", "SOOT_BLOWER_DATA"]);
const OPTIONAL_DOCUMENT_URL_CATEGORIES = new Set(["GRID_SEPARATION", "STARTUP_DATA"]);
const ARCHIVE_EDIT_CATEGORIES = new Set(["ARCHIVE", "GRID_SEPARATION", "STARTUP_DATA", "BOILER_CALIBRATION", "MAJOR_REPAIR", "OIL_GUN_DATA", "SOOT_BLOWER_DATA"]);
const OPERATION_DOCUMENT_CATEGORIES = new Set(["PROCEDURE", "PID"]);

function documentPermissionId(category: string) {
  if (category === "PROCEDURE") return "document-procedure";
  if (category === "PID") return "document-pid";
  return archiveCategoryPermissionId(category);
}

function documentPermissionLabel(category: string) {
  if (category === "GRID_SEPARATION") return "dữ liệu tách lưới";
  if (category === "STARTUP_DATA") return "dữ liệu khởi động";
  if (category === "BOILER_CALIBRATION") return "dữ liệu hiệu chỉnh lò";
  if (category === "MAJOR_REPAIR") return "sửa chữa lớn";
  if (category === "OIL_GUN_DATA") return "dữ liệu vòi dầu";
  if (category === "SOOT_BLOWER_DATA") return "dữ liệu vòi thổi bụi";
  if (category === "PROCEDURE") return "quy trình";
  if (category === "PID") return "sơ đồ P&ID";
  return "hồ sơ lưu trữ";
}

function documentPermissionMessage(action: "xem" | "thêm" | "chỉnh sửa" | "xoá", category: string) {
  return `Bạn không có quyền ${action} ${documentPermissionLabel(category)}`;
}

function readLevels() {
  return ["read", "own", "create", "approve", "manage", "full"] as const;
}

function createLevels() {
  return ["create", "manage", "full"] as const;
}

function manageLevels() {
  return ["manage", "full"] as const;
}

function fullLevels() {
  return ["full"] as const;
}

function isOperationDocumentPermission(permissionId: string | null) {
  return permissionId === "document-procedure" || permissionId === "document-pid";
}

async function requireDocumentPermission(
  user: { id?: string; role?: string },
  category: string,
  action: "read" | "create" | "manage" | "delete"
) {
  // Vòi đốt / vòi thổi bụi: chặn cứng theo chức vụ. Đọc → chỉ cần chức vụ (thay RBAC);
  // ghi → chức vụ + RBAC như thường.
  if (OIL_SOOT_GATED_CATEGORIES.has(category)) {
    await assertOilSootAccess(user);
    if (action === "read") return;
  }

  const permissionId = documentPermissionId(category);
  if (permissionId) {
    const levels = action === "read" ? readLevels() : action === "create" ? createLevels() : action === "manage" ? manageLevels() : fullLevels();
    const verb = action === "read" ? "xem" : action === "create" ? "thêm" : action === "manage" ? "chỉnh sửa" : "xoá";
    const genericMessage = isOperationDocumentPermission(permissionId)
      ? action === "read"
        ? "Bạn không có quyền xem tài liệu vận hành"
        : action === "create"
          ? "Bạn không có quyền thêm tài liệu vận hành"
          : action === "manage"
            ? "Bạn không có quyền chỉnh sửa tài liệu"
            : "Bạn không có quyền xoá tài liệu"
      : documentPermissionMessage(verb, category);
    await requirePermissionLevel(user, permissionId, [...levels], genericMessage);
    return;
  }

  if (action === "read") {
    await requirePermissionLevel(user, "archive-read", [...readLevels()], "Bạn không có quyền xem hồ sơ lưu trữ");
    return;
  }
  if (action === "create") {
    await requirePermissionLevel(user, "archive-create-delete", [...createLevels()], "Bạn không có quyền thêm hồ sơ lưu trữ");
    return;
  }
  if (action === "manage") {
    await requirePermissionLevel(user, "archive-edit", [...manageLevels()], "Bạn không có quyền chỉnh sửa hồ sơ lưu trữ");
    return;
  }
  await requirePermissionLevel(user, "archive-create-delete", [...fullLevels()], "Bạn không có quyền xoá hồ sơ lưu trữ");
}

function documentEditPermissionId(category: string) {
  const permissionId = documentPermissionId(category);
  if (permissionId) return permissionId;
  if (ARCHIVE_EDIT_CATEGORIES.has(category)) return "archive-edit";
  return null;
}

// Bảng DigitalDocument (gồm index theo category + updatedAt) được khai báo trong
// prisma/schema.prisma và tạo bằng db push.
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
    const user = await requireUser();

    const category = normalizeCategory(req.nextUrl.searchParams.get("category"));
    if (!category) return fail("Danh mục tài liệu không hợp lệ");
    await requireDocumentPermission(user, category, "read");

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

    const body = (await req.json()) as Record<string, unknown>;
    const category = normalizeCategory(String(body.category ?? ""));
    if (!category) return fail("Danh mục tài liệu không hợp lệ");
    await requireDocumentPermission(user, category, "create");

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

    const body = (await req.json()) as Record<string, unknown>;
    const id = String(body.id ?? "").trim();
    const category = normalizeCategory(String(body.category ?? ""));
    if (!id) return fail("Thiếu id tài liệu");
    if (!category) return fail("Danh mục tài liệu không hợp lệ");
    if (documentEditPermissionId(category)) {
      await requireDocumentPermission(user, category, "manage");
    } else {
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

    const id = req.nextUrl.searchParams.get("id")?.trim();
    const category = normalizeCategory(req.nextUrl.searchParams.get("category"));
    if (!id) return fail("Thiếu id tài liệu");
    if (!category) return fail("Danh mục tài liệu không hợp lệ");
    await requireDocumentPermission(user, category, "delete");

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
