-- Chỉ thêm định danh; không suy đoán CHTT hoặc người cấp của phiếu cũ từ tên.
BEGIN;
ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "issuerUserId" TEXT;
ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "commanderPersonId" TEXT;
COMMIT;
