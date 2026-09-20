-- Mở rộng gom nhóm vật tư từ chỉ "Dầu bôi trơn" sang 4 loại:
-- Dầu bôi trơn | Lõi lọc dầu | Hóa Chất | Bi Nghiền Than.
-- Chạy SAU prisma/add_oil_grouping.sql. Idempotent — chạy lại nhiều lần không sao.
-- Áp dụng bằng: npx prisma db execute --file prisma/add_grouping_categories.sql --schema prisma/schema.prisma

ALTER TABLE "oil_types"
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'Dầu bôi trơn';

CREATE INDEX IF NOT EXISTS "oil_types_category_idx" ON "oil_types"("category");
