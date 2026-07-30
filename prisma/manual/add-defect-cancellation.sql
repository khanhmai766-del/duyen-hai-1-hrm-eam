-- Hủy logic phiếu khiếm khuyết: giữ nguyên bản ghi và khóa liên kết Google Sheet.
ALTER TABLE "Defect"
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledById" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelledByName" TEXT;

CREATE INDEX IF NOT EXISTS "Defect_cancelledAt_idx"
  ON "Defect"("cancelledAt");
