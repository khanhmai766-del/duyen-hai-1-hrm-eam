-- Chỉ tạo hàng đợi báo cáo PCT đại tu; không thay đổi hoặc xoá dữ liệu nghiệp vụ hiện có.
CREATE TABLE IF NOT EXISTS "WorkPermitTelegramOutbox" (
  "id" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "permitId" TEXT,
  "sessionId" TEXT,
  "kind" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "baseline" JSONB,
  "message" TEXT,
  "combinedMessage" TEXT,
  "messages" JSONB,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL,
  "claimedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkPermitTelegramOutbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkPermitTelegramOutbox_dedupeKey_key" ON "WorkPermitTelegramOutbox"("dedupeKey");
CREATE INDEX IF NOT EXISTS "WorkPermitTelegramOutbox_state_nextAttemptAt_idx" ON "WorkPermitTelegramOutbox"("state", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "WorkPermitTelegramOutbox_sessionId_kind_idx" ON "WorkPermitTelegramOutbox"("sessionId", "kind");
