import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { hasPermissionLevel } from "@/lib/rbac-guard";

function normalizeList(value: unknown, max: number) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean).slice(0, max);
  }
  if (typeof value === "string") {
    return value.split(/[,\n]/).map((v) => v.trim()).filter(Boolean).slice(0, max);
  }
  return [];
}

async function getReplyAuthor(id: string): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ authorId: string }>>(
    `SELECT "authorId" FROM "ForumReply" WHERE id = $1 LIMIT 1`,
    id
  );
  return rows.length ? rows[0].authorId : null;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    const authorId = await getReplyAuthor(params.id);
    if (!authorId) return fail("Không tìm thấy phản hồi Forum", 404);
    if (user.id !== authorId && !(await hasPermissionLevel(user, "forum-moderate", ["full"]))) return fail("Bạn không có quyền sửa phản hồi này", 403);

    const content = String(body.content ?? "").trim();
    const attachments = normalizeList(body.attachments, 5);
    if (!content) return fail("Vui lòng nhập nội dung phản hồi");

    await prisma.$executeRawUnsafe(
      `UPDATE "ForumReply" SET content = $2, attachments = $3 WHERE id = $1`,
      params.id,
      content,
      attachments
    );
    await audit(user.id, "UPDATE_FORUM_REPLY", "ForumReply", params.id);
    return ok({ id: params.id });
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const authorId = await getReplyAuthor(params.id);
    if (!authorId) return fail("Không tìm thấy phản hồi Forum", 404);
    if (user.id !== authorId && !(await hasPermissionLevel(user, "forum-moderate", ["full"]))) return fail("Bạn không có quyền gỡ phản hồi này", 403);

    await prisma.$executeRawUnsafe(`DELETE FROM "ForumReply" WHERE id = $1`, params.id);
    await audit(user.id, "DELETE_FORUM_REPLY", "ForumReply", params.id);
    return ok({ id: params.id });
  });
}
