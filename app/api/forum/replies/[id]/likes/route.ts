import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { ensureForumReplyLikeTable } from "@/lib/forum-likes";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await ensureForumReplyLikeTable();

    const replies = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "ForumReply" WHERE id = $1 LIMIT 1`,
      params.id
    );
    if (!replies.length) return fail("Không tìm thấy phản hồi Forum", 404);

    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "ForumReplyLike" WHERE "replyId" = $1 AND "userId" = $2 LIMIT 1`,
      params.id,
      user.id
    );

    if (existing.length) {
      await prisma.$executeRawUnsafe(`DELETE FROM "ForumReplyLike" WHERE id = $1`, existing[0].id);
      await audit(user.id, "UNLIKE_FORUM_REPLY", "ForumReply", params.id);
      return ok({ liked: false });
    }

    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ForumReplyLike" (id, "replyId", "userId") VALUES ($1, $2, $3) ON CONFLICT ("replyId", "userId") DO NOTHING`,
      id,
      params.id,
      user.id
    );
    await audit(user.id, "LIKE_FORUM_REPLY", "ForumReply", params.id);
    return ok({ liked: true });
  });
}
