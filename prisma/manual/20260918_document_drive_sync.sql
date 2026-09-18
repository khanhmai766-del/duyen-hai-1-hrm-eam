-- Mở rộng không phá huỷ cho đồng bộ Google Drive và lập chỉ mục AI.
-- Có thể chạy nhiều lần; không xoá hoặc đổi giá trị documentUrl hiện hữu.
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "driveFolderId" TEXT;
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "driveFileId" TEXT;
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "driveFileName" TEXT;
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "driveMimeType" TEXT;
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "driveModifiedAt" TIMESTAMP(3);
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "driveWebViewLink" TEXT;
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "driveChecksum" TEXT;
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "driveSyncStatus" TEXT;
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "driveSyncError" TEXT;
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "driveLastSyncedAt" TIMESTAMP(3);
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "aiIndexedAt" TIMESTAMP(3);
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "aiIndexVersion" TEXT;
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "aiIndexError" TEXT;

CREATE INDEX IF NOT EXISTS "DigitalDocument_driveFolderId_idx" ON "DigitalDocument"("driveFolderId");
CREATE INDEX IF NOT EXISTS "DigitalDocument_driveFileId_idx" ON "DigitalDocument"("driveFileId");
CREATE INDEX IF NOT EXISTS "DigitalDocument_driveSyncStatus_idx" ON "DigitalDocument"("driveSyncStatus");
