import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { normalizeForumTargetPositions } from "@/lib/forum-targets";
import { ensureForumLifecycleColumns } from "@/lib/forum-targets-server";
import { hasPermissionLevel, requirePermissionLevel } from "@/lib/rbac-guard";

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

async function isPostClosed(id: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ closed: boolean }>>(
    `SELECT ("closedAt" IS NOT NULL) AS closed FROM "ForumPost" WHERE id = $1 LIMIT 1`,
    id
  );
  return rows[0]?.closed ?? false;
}

/**
 * PUT: ghim/bỏ ghim (chỉ Admin), đóng chủ đề, hoặc sửa nội dung chủ đề.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    await ensureForumLifecycleColumns();
    const authorId = await getPostAuthor(params.id);
    if (!authorId) return fail("Không tìm thấy chủ đề Forum", 404);
    const isOwner = user.id === authorId;

    if (typeof body.isPinned === "boolean") {
      await requirePermissionLevel(user, "forum-moderate", ["full"], "Không đủ quyền ghim chủ đề");
      await prisma.$executeRawUnsafe(`UPDATE "ForumPost" SET "isPinned" = $2 WHERE id = $1`, params.id, body.isPinned);
      await audit(user.id, "PIN_FORUM_POST", "ForumPost", params.id, String(body.isPinned));
      return ok({ id: params.id, isPinned: body.isPinned });
    }

    if (!isOwner && !(await hasPermissionLevel(user, "forum-moderate", ["full"]))) return fail("Bạn không có quyền sửa chủ đề này", 403);

    if (body.action === "CLOSE") {
      if (await isPostClosed(params.id)) return fail("Chủ đề này đã được kết thúc", 400);
      const closeSummary = String(body.closeSummary ?? "").trim();
      if (!closeSummary) return fail("Vui lòng nhập tóm tắt, kết luận trước khi đóng chủ đề");
      await prisma.$executeRawUnsafe(
        `UPDATE "ForumPost" SET "closeSummary" = $2, "closedAt" = CURRENT_TIMESTAMP, "closedById" = $3, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
        params.id,
        closeSummary,
        user.id
      );
      await audit(user.id, "CLOSE_FORUM_POST", "ForumPost", params.id, closeSummary);
      return ok({ id: params.id });
    }

    if (await isPostClosed(params.id)) return fail("Chủ đề đã kết thúc, không thể chỉnh sửa nội dung", 400);
    const title = String(body.title ?? "").trim();
    const content = String(body.content ?? "").trim();
    const category = String(body.category ?? "DISCUSSION").trim() || "DISCUSSION";
    const tags = normalizeList(body.tags, 8);
    const attachments = normalizeList(body.attachments, 8);
    const targetPositions = normalizeForumTargetPositions(body.targetPositions);
    if (!title) return fail("Vui lòng nhập tiêu đề chủ đề");
    if (!content) return fail("Vui lòng nhập nội dung trao đổi");

    await prisma.$executeRawUnsafe(
      `UPDATE "ForumPost" SET title = $2, content = $3, category = $4, tags = $5, attachments = $6, "targetPositions" = $7, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
      params.id,
      title,
      content,
      category,
      tags,
      attachments,
      targetPositions
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
    if (user.id !== authorId && !(await hasPermissionLevel(user, "forum-moderate", ["full"]))) return fail("Bạn không có quyền gỡ chủ đề này", 403);

    await prisma.$executeRawUnsafe(`DELETE FROM "ForumPost" WHERE id = $1`, params.id);
    await audit(user.id, "DELETE_FORUM_POST", "ForumPost", params.id);
    return ok({ id: params.id });
  });
}
