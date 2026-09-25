-- Thông tin thẻ ra vào cổng & ATVSLĐ của nhân sự nhà thầu (đồng bộ từ Google Sheets) + ảnh trên S3.
-- Không phá dữ liệu: chỉ thêm cột, mặc định rỗng/NULL.
ALTER TABLE "WorkPermitPerson" ADD COLUMN IF NOT EXISTS "birthYear" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkPermitPerson" ADD COLUMN IF NOT EXISTS "jobTitle" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkPermitPerson" ADD COLUMN IF NOT EXISTS "workPackage" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkPermitPerson" ADD COLUMN IF NOT EXISTS "workPosition" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkPermitPerson" ADD COLUMN IF NOT EXISTS "workArea" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkPermitPerson" ADD COLUMN IF NOT EXISTS "trainingResult" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkPermitPerson" ADD COLUMN IF NOT EXISTS "trainedAt" TIMESTAMP(3);
ALTER TABLE "WorkPermitPerson" ADD COLUMN IF NOT EXISTS "cardIssuedAt" TIMESTAMP(3);
ALTER TABLE "WorkPermitPerson" ADD COLUMN IF NOT EXISTS "cardExpiresAt" TIMESTAMP(3);
ALTER TABLE "WorkPermitPerson" ADD COLUMN IF NOT EXISTS "photoKey" TEXT;
ALTER TABLE "WorkPermitPerson" ADD COLUMN IF NOT EXISTS "photoSource" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkPermitPerson" ADD COLUMN IF NOT EXISTS "sheetSyncedAt" TIMESTAMP(3);
