import { prisma } from "@/lib/prisma";

export async function ensureForumTargetPositionsColumn() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ForumPost"
    ADD COLUMN IF NOT EXISTS "targetPositions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
  `);
}

export async function ensureForumLifecycleColumns() {
  await ensureForumTargetPositionsColumn();
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ForumPost"
    ADD COLUMN IF NOT EXISTS "closeSummary" TEXT,
    ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "closedById" TEXT
  `);
}

export async function ensureForumReplyThreadColumn() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ForumReply"
    ADD COLUMN IF NOT EXISTS "parentReplyId" TEXT
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ForumReply_parentReplyId_idx" ON "ForumReply" ("parentReplyId")`);
}
