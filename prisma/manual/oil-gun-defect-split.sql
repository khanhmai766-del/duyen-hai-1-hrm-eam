-- Tách khiếm khuyết vòi dầu thành 2 ô: SCCN (sửa chữa cơ nhiệt) + SCĐ (sửa chữa điện).
-- Giữ cột "defect" cũ làm legacy (không mất dữ liệu). Idempotent — chạy lại an toàn.
--   npx prisma db execute --file scripts/sql/oil-gun-defect-split.sql --schema prisma/schema.prisma

ALTER TABLE "OilGun" ADD COLUMN IF NOT EXISTS "defectSccn" TEXT;
ALTER TABLE "OilGun" ADD COLUMN IF NOT EXISTS "defectScd" TEXT;

-- Backfill: khiếm khuyết cũ (1 ô) đưa vào SCCN để không mất — chỉ khi SCCN chưa có.
UPDATE "OilGun"
SET "defectSccn" = "defect"
WHERE "defectSccn" IS NULL AND "defect" IS NOT NULL AND btrim("defect") <> '';
