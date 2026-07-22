import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { ensureForumPostLikeTable, isForeignKeyViolation } from "@/lib/forum-likes";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await ensureForumPostLikeTable();

    // Toggle nguyên tử trong 1 round-trip: xóa nếu đã thích, ngược lại chèn mới.
    // Vi phạm khóa ngoại (23503) = chủ đề không tồn tại → 404 thân thiện.
    const id = randomUUID();
    let rows: Array<{ liked: boolean }>;
    try {
      rows = await prisma.$queryRawUnsafe<Array<{ liked: boolean }>>(
        `
          WITH del AS (
            DELETE FROM "ForumPostLike" WHERE "postId" = $1 AND "userId" = $2 RETURNING id
          ), ins AS (
            INSERT INTO "ForumPostLike" (id, "postId", "userId")
            SELECT $3, $1, $2 WHERE NOT EXISTS (SELECT 1 FROM del)
            RETURNING id
          )
          SELECT EXISTS (SELECT 1 FROM ins) AS liked
        `,
        params.id,
        user.id,
        id
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) return fail("Không tìm thấy chủ đề Forum", 404);
      throw error;
    }

    const liked = rows[0]?.liked ?? false;
    await audit(user.id, liked ? "LIKE_FORUM_POST" : "UNLIKE_FORUM_POST", "ForumPost", params.id);
    return ok({ liked });
  });
}
