-- Đợt 2 đại tu (10/2026): kết quả từng hạng mục khi kết thúc lần làm việc + hàng đợi ghi Google Sheets tiến độ.
-- Chỉ thêm cột/bảng, không chạm dữ liệu cũ. Chạy lại an toàn.
ALTER TABLE "WorkPermitSession" ADD COLUMN IF NOT EXISTS "itemProgress" JSONB;

CREATE TABLE IF NOT EXISTS "OverhaulSheetOutbox" (
  "id" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "permitId" TEXT NOT NULL,
  "sessionId" TEXT,
  "kind" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sheet" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "percent" INTEGER,
  "note" TEXT NOT NULL DEFAULT '',
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OverhaulSheetOutbox_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "OverhaulSheetOutbox" ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "OverhaulSheetOutbox_dedupeKey_key" ON "OverhaulSheetOutbox"("dedupeKey");
CREATE INDEX IF NOT EXISTS "OverhaulSheetOutbox_state_nextAttemptAt_createdAt_idx" ON "OverhaulSheetOutbox"("state", "nextAttemptAt", "createdAt");
CREATE INDEX IF NOT EXISTS "OverhaulSheetOutbox_permitId_createdAt_idx" ON "OverhaulSheetOutbox"("permitId", "createdAt");
CREATE INDEX IF NOT EXISTS "OverhaulSheetOutbox_source_sheet_code_createdAt_idx" ON "OverhaulSheetOutbox"("source", "sheet", "code", "createdAt");
