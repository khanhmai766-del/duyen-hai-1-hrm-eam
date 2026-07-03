import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { ensureForumPostLikeTable } from "@/lib/forum-likes";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await ensureForumPostLikeTable();

    const posts = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "ForumPost" WHERE id = $1 LIMIT 1`,
      params.id
    );
    if (!posts.length) return fail("Không tìm thấy chủ đề Forum", 404);

    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "ForumPostLike" WHERE "postId" = $1 AND "userId" = $2 LIMIT 1`,
      params.id,
      user.id
    );

    if (existing.length) {
      await prisma.$executeRawUnsafe(`DELETE FROM "ForumPostLike" WHERE id = $1`, existing[0].id);
      await audit(user.id, "UNLIKE_FORUM_POST", "ForumPost", params.id);
      return ok({ liked: false });
    }

    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ForumPostLike" (id, "postId", "userId") VALUES ($1, $2, $3) ON CONFLICT ("postId", "userId") DO NOTHING`,
      id,
      params.id,
      user.id
    );
    await audit(user.id, "LIKE_FORUM_POST", "ForumPost", params.id);
    return ok({ liked: true });
  });
}
