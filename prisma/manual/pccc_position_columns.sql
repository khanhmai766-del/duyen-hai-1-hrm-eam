-- Chuẩn hoá cương vị PCCC theo danh mục chức danh của hệ thống:
--   * <bảng>.cuongVi      : nhãn hiển thị, KHÔNG còn hậu tố tổ máy ("Lò phó")
--   * <bảng>.cuongViCode  : PositionCode — khoá dùng cho phân quyền
--   * <bảng>.machine      : S1 | S2 | COMMON (tách khỏi nhãn cương vị)
-- Chỉ THÊM cột + index, không đụng dữ liệu. Chạy:
--   npx prisma db execute --file scripts/sql/pccc_position_columns.sql --schema prisma/schema.prisma
-- Sau đó nạp giá trị bằng: npm run normalize:pccc -- --apply

ALTER TABLE "pccc_extinguishers"
  ADD COLUMN IF NOT EXISTS "cuongViCode" TEXT,
  ADD COLUMN IF NOT EXISTS "nguoiGiamSatCode" TEXT,
  ADD COLUMN IF NOT EXISTS "machine" TEXT NOT NULL DEFAULT 'COMMON';

ALTER TABLE "pccc_cabinets"
  ADD COLUMN IF NOT EXISTS "cuongViCode" TEXT,
  ADD COLUMN IF NOT EXISTS "machine" TEXT NOT NULL DEFAULT 'COMMON';

ALTER TABLE "pccc_bulks"
  ADD COLUMN IF NOT EXISTS "cuongViCode" TEXT,
  ADD COLUMN IF NOT EXISTS "machine" TEXT NOT NULL DEFAULT 'COMMON';

ALTER TABLE "pccc_fm200_panels"
  ADD COLUMN IF NOT EXISTS "cuongViCode" TEXT,
  ADD COLUMN IF NOT EXISTS "machine" TEXT NOT NULL DEFAULT 'COMMON';

CREATE INDEX IF NOT EXISTS "pccc_extinguishers_periodId_cuongViCode_idx" ON "pccc_extinguishers"("periodId", "cuongViCode");
CREATE INDEX IF NOT EXISTS "pccc_extinguishers_periodId_machine_idx"     ON "pccc_extinguishers"("periodId", "machine");
CREATE INDEX IF NOT EXISTS "pccc_cabinets_periodId_cuongViCode_idx"      ON "pccc_cabinets"("periodId", "cuongViCode");
CREATE INDEX IF NOT EXISTS "pccc_cabinets_periodId_machine_idx"          ON "pccc_cabinets"("periodId", "machine");
CREATE INDEX IF NOT EXISTS "pccc_bulks_periodId_cuongViCode_idx"         ON "pccc_bulks"("periodId", "cuongViCode");
CREATE INDEX IF NOT EXISTS "pccc_bulks_periodId_machine_idx"             ON "pccc_bulks"("periodId", "machine");

DROP INDEX IF EXISTS "pccc_extinguishers_periodId_cuongVi_idx";
DROP INDEX IF EXISTS "pccc_cabinets_periodId_cuongVi_idx";
DROP INDEX IF EXISTS "pccc_bulks_periodId_cuongVi_idx";
