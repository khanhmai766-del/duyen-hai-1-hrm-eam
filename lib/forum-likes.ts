import { prisma } from "@/lib/prisma";

let forumPostLikeTableReady = false;
let forumReplyLikeTableReady = false;

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

export async function ensureForumReplyLikeTable() {
  if (forumReplyLikeTableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ForumReplyLike" (
      id TEXT PRIMARY KEY,
      "replyId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ForumReplyLike_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "ForumReply"(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ForumReplyLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ForumReplyLike_replyId_userId_key" ON "ForumReplyLike" ("replyId", "userId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ForumReplyLike_userId_idx" ON "ForumReplyLike" ("userId")`);
  forumReplyLikeTableReady = true;
}
