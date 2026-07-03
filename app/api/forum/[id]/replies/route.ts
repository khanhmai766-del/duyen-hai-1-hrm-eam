import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireUser();
    const exists = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "ForumPost" WHERE id = $1 LIMIT 1`,
      params.id
    );
    if (!exists.length) return fail("Không tìm thấy chủ đề", 404);

    const replies = await prisma.$queryRawUnsafe(
      `
        SELECT
          r.id,
          r."postId",
          r.content,
          r.attachments,
          r."createdAt",
          json_build_object(
            'id', u.id,
            'name', u.name,
            'position', u.position,
            'avatarUrl', u."avatarUrl"
          ) AS author
        FROM "ForumReply" r
        JOIN "User" u ON u.id = r."authorId"
        WHERE r."postId" = $1
        ORDER BY r."createdAt" ASC
      `,
      params.id
    );
    return ok(replies);
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "forum-write", ["create", "manage", "full"], "Không đủ quyền phản hồi forum");
    const body = await req.json();
    const content = String(body.content ?? "").trim();
    const attachments = normalizeList(body.attachments, 5);

    if (!content) return fail("Vui lòng nhập nội dung phản hồi");

    const exists = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "ForumPost" WHERE id = $1 LIMIT 1`,
      params.id
    );
    if (!exists.length) return fail("Không tìm thấy chủ đề", 404);

    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ForumReply" (id, "postId", content, attachments, "authorId") VALUES ($1, $2, $3, $4, $5)`,
      id,
      params.id,
      content,
      attachments,
      user.id
    );
    await prisma.$executeRawUnsafe(`UPDATE "ForumPost" SET "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1`, params.id);
    await audit(user.id, "CREATE_FORUM_REPLY", "ForumReply", id, params.id);
    return ok({ id });
  });
}

function normalizeList(value: unknown, max: number) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean).slice(0, max);
  }
  if (typeof value === "string") {
    return value.split(/[,\n]/).map((v) => v.trim()).filter(Boolean).slice(0, max);
  }
  return [];
}
