-- Đo lường chất lượng trợ lý AI: đánh giá của người dùng + một dòng cho mỗi lượt hỏi.
-- Viết theo kiểu IF NOT EXISTS để chạy lại nhiều lần không hỏng.

ALTER TABLE "AiMessage"
  ADD COLUMN IF NOT EXISTS "rating" INTEGER,
  ADD COLUMN IF NOT EXISTS "ratedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "AiTurnLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "messageId" TEXT,
  "status" TEXT NOT NULL,
  "errorCode" TEXT,
  "latencyMs" INTEGER NOT NULL,
  "toolCalls" INTEGER NOT NULL DEFAULT 0,
  "citationCount" INTEGER NOT NULL DEFAULT 0,
  "answerChars" INTEGER NOT NULL DEFAULT 0,
  "questionChars" INTEGER NOT NULL DEFAULT 0,
  "retries" INTEGER NOT NULL DEFAULT 0,
  "pagePath" TEXT,
  "rating" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiTurnLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiTurnLog_createdAt_idx" ON "AiTurnLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AiTurnLog_status_createdAt_idx" ON "AiTurnLog"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "AiTurnLog_userId_createdAt_idx" ON "AiTurnLog"("userId", "createdAt");
