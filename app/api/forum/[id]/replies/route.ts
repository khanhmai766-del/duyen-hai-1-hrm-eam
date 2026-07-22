import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { ensureForumReplyLikeTable } from "@/lib/forum-likes";
import { ensureForumLifecycleColumns, ensureForumReplyThreadColumn } from "@/lib/forum-targets-server";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { publicUserRef } from "@/lib/s3";

const viTime = (column: string) => `to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.MS') || '+07:00'`;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await ensureForumReplyLikeTable();
    await ensureForumReplyThreadColumn();
    const exists = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "ForumPost" WHERE id = $1 LIMIT 1`,
      params.id
    );
    if (!exists.length) return fail("Không tìm thấy chủ đề", 404);

    const replies = await prisma.$queryRawUnsafe<RawForumReply[]>(
      `
        SELECT
          r.id,
          r."postId",
          r."parentReplyId",
          r.content,
          r.attachments,
          ${viTime('r."createdAt"')} AS "createdAt",
          json_build_object(
            'id', u.id,
            'name', u.name,
            'position', u.position,
            'avatarUrl', u."avatarUrl",
            'avatarKey', u."avatar_key"
          ) AS author,
          (
            SELECT COUNT(*)::int
            FROM "ForumReplyLike" l
            WHERE l."replyId" = r.id
          ) AS "likeCount",
          EXISTS (
            SELECT 1
            FROM "ForumReplyLike" ml
            WHERE ml."replyId" = r.id AND ml."userId" = $2
          ) AS "likedByMe",
          CASE
            WHEN pr.id IS NULL THEN NULL
            ELSE json_build_object(
              'id', pr.id,
              'content', pr.content,
              'createdAt', ${viTime('pr."createdAt"')},
              'author', json_build_object(
                'id', pu.id,
                'name', pu.name,
                'position', pu.position,
                'avatarUrl', pu."avatarUrl",
                'avatarKey', pu."avatar_key"
              )
            )
          END AS "parentReply"
        FROM "ForumReply" r
        JOIN "User" u ON u.id = r."authorId"
        LEFT JOIN "ForumReply" pr ON pr.id = r."parentReplyId"
        LEFT JOIN "User" pu ON pu.id = pr."authorId"
        WHERE r."postId" = $1
        ORDER BY r."createdAt" ASC
      `,
      params.id,
      user.id
    );
    return ok(replies.map(publicForumReply));
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "forum-write", ["create", "manage", "full"], "Không đủ quyền phản hồi forum");
    await ensureForumLifecycleColumns();
    await ensureForumReplyThreadColumn();
    const body = await req.json();
    const content = String(body.content ?? "").trim();
    const attachments = normalizeList(body.attachments, 5);
    const parentReplyId = typeof body.parentReplyId === "string" && body.parentReplyId.trim() ? body.parentReplyId.trim() : null;

    if (!content) return fail("Vui lòng nhập nội dung phản hồi");

    // Một truy vấn: vừa xác nhận chủ đề tồn tại (rỗng = 404) vừa lấy trạng thái đóng.
    const post = await prisma.$queryRawUnsafe<Array<{ closed: boolean }>>(
      `SELECT ("closedAt" IS NOT NULL) AS closed FROM "ForumPost" WHERE id = $1 LIMIT 1`,
      params.id
    );
    if (!post.length) return fail("Không tìm thấy chủ đề", 404);
    if (post[0].closed) return fail("Chủ đề đã kết thúc, không thể gửi phản hồi mới", 400);
    if (parentReplyId) {
      const parent = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "ForumReply" WHERE id = $1 AND "postId" = $2 LIMIT 1`,
        parentReplyId,
        params.id
      );
      if (!parent.length) return fail("Không tìm thấy phản hồi cần trả lời trong chủ đề này", 404);
    }

    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ForumReply" (id, "postId", "parentReplyId", content, attachments, "authorId") VALUES ($1, $2, $3, $4, $5, $6)`,
      id,
      params.id,
      parentReplyId,
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

type RawForumReply = {
  author: {
    id: string;
    name: string;
    position: string | null;
    avatarUrl?: string | null;
    avatarKey?: string | null;
  };
  parentReply: {
    id: string;
    content: string;
    createdAt: string;
    author: {
      id: string;
      name: string;
      position: string | null;
      avatarUrl?: string | null;
      avatarKey?: string | null;
    };
  } | null;
};

function publicForumReply<T extends RawForumReply>(reply: T) {
  return {
    ...reply,
    author: publicUserRef(reply.author),
    parentReply: reply.parentReply
      ? {
          ...reply.parentReply,
          author: publicUserRef(reply.parentReply.author),
        }
      : null,
  };
}
