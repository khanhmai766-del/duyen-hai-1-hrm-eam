import { prisma } from "@/lib/prisma";

let forumPostLikeTableReady = false;

export async function ensureForumPostLikeTable() {
  if (forumPostLikeTableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ForumPostLike" (
      id TEXT PRIMARY KEY,
      "postId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ForumPostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ForumPostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ForumPostLike_postId_userId_key" ON "ForumPostLike" ("postId", "userId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ForumPostLike_userId_idx" ON "ForumPostLike" ("userId")`);
  forumPostLikeTableReady = true;
}
