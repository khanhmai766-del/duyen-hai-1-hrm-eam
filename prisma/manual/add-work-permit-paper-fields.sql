-- Thông tin cấp PCT giấy; giá trị rỗng/null giữ nguyên ý nghĩa phiếu cũ chưa nhập.
BEGIN;
ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "registrationNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "workScope" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "plannedStartAt" TIMESTAMP(3);
ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "plannedEndAt" TIMESTAMP(3);
ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "disciplines" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
COMMIT;
