import { prisma } from "@/lib/prisma";

// Các cờ warmup cấp module: DDL "ADD COLUMN IF NOT EXISTS" chỉ cần chạy 1 lần cho mỗi
// tiến trình server (giống pattern trong lib/forum-likes.ts). Nếu không, mỗi request forum
// sẽ phát sinh vài lệnh ALTER TABLE/CREATE INDEX thừa và giữ lock không cần thiết.
let targetPositionsColumnReady = false;
let lifecycleColumnsReady = false;
let replyThreadColumnReady = false;

export async function ensureForumTargetPositionsColumn() {
  if (targetPositionsColumnReady) return;
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ForumPost"
    ADD COLUMN IF NOT EXISTS "targetPositions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
  `);
  targetPositionsColumnReady = true;
}

export async function ensureForumLifecycleColumns() {
  if (lifecycleColumnsReady) return;
  await ensureForumTargetPositionsColumn();
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ForumPost"
    ADD COLUMN IF NOT EXISTS "closeSummary" TEXT,
    ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "closedById" TEXT
  `);
  lifecycleColumnsReady = true;
}

export async function ensureForumReplyThreadColumn() {
  if (replyThreadColumnReady) return;
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ForumReply"
    ADD COLUMN IF NOT EXISTS "parentReplyId" TEXT
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ForumReply_parentReplyId_idx" ON "ForumReply" ("parentReplyId")`);
  replyThreadColumnReady = true;
}
