-- Thêm cột "Hiện có" (onHandQty — số đếm thực tế tại kho, nhập tay) vào bảng
-- nhóm vật tư. Chạy SAU prisma/add_grouping_categories.sql. Idempotent.
-- Áp dụng bằng: npx prisma db execute --file prisma/add_group_onhand.sql --schema prisma/schema.prisma

ALTER TABLE "oil_types"
  ADD COLUMN IF NOT EXISTS "onHandQty" DOUBLE PRECISION NOT NULL DEFAULT 0;
