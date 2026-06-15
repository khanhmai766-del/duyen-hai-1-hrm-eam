import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";

function normalizeList(value: unknown, max: number) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean).slice(0, max);
  }
  if (typeof value === "string") {
    return value.split(/[,\n]/).map((v) => v.trim()).filter(Boolean).slice(0, max);
  }
  return [];
}

async function getPostAuthor(id: string): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ authorId: string }>>(
    `SELECT "authorId" FROM "ForumPost" WHERE id = $1 LIMIT 1`,
    id
  );
  return rows.length ? rows[0].authorId : null;
}

/**
 * PUT: ghim/bỏ ghim (chỉ Admin) HOẶC sửa nội dung chủ đề (tác giả hoặc Admin).
 * Phân biệt theo body: có `isPinned` → ghim; ngược lại → sửa nội dung.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    const authorId = await getPostAuthor(params.id);
    if (!authorId) return fail("Không tìm thấy chủ đề Forum", 404);
    const isAdmin = user.role === "ADMIN";
    const isOwner = user.id === authorId;

    if (typeof body.isPinned === "boolean") {
      if (!isAdmin) return fail("Chỉ quản trị viên được ghim chủ đề", 403);
      await prisma.$executeRawUnsafe(`UPDATE "ForumPost" SET "isPinned" = $2 WHERE id = $1`, params.id, body.isPinned);
      await audit(user.id, "PIN_FORUM_POST", "ForumPost", params.id, String(body.isPinned));
      return ok({ id: params.id, isPinned: body.isPinned });
    }

    if (!isOwner && !isAdmin) return fail("Bạn không có quyền sửa chủ đề này", 403);
    const title = String(body.title ?? "").trim();
    const content = String(body.content ?? "").trim();
    const category = String(body.category ?? "DISCUSSION").trim() || "DISCUSSION";
    const tags = normalizeList(body.tags, 8);
    const attachments = normalizeList(body.attachments, 8);
    if (!title) return fail("Vui lòng nhập tiêu đề chủ đề");
    if (!content) return fail("Vui lòng nhập nội dung trao đổi");

    await prisma.$executeRawUnsafe(
      `UPDATE "ForumPost" SET title = $2, content = $3, category = $4, tags = $5, attachments = $6, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
      params.id,
      title,
      content,
      category,
      tags,
      attachments
    );
    await audit(user.id, "UPDATE_FORUM_POST", "ForumPost", params.id, title);
    return ok({ id: params.id });
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const authorId = await getPostAuthor(params.id);
    if (!authorId) return fail("Không tìm thấy chủ đề Forum", 404);
    if (user.role !== "ADMIN" && user.id !== authorId) return fail("Bạn không có quyền gỡ chủ đề này", 403);

    await prisma.$executeRawUnsafe(`DELETE FROM "ForumPost" WHERE id = $1`, params.id);
    await audit(user.id, "DELETE_FORUM_POST", "ForumPost", params.id);
    return ok({ id: params.id });
  });
}
