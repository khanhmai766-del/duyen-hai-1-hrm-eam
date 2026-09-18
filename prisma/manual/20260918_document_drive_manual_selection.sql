-- Bổ sung không phá huỷ cho chức năng chọn PDF chính ngay trên Danh mục quy trình.
-- Idempotent: có thể chạy lại khi deploy mà không làm thay đổi dữ liệu hiện hữu.
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "driveCandidateFiles" TEXT;
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "driveManualFileId" TEXT;

CREATE INDEX IF NOT EXISTS "DigitalDocument_driveManualFileId_idx"
  ON "DigitalDocument"("driveManualFileId");
