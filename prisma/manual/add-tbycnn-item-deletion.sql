-- Công tắc cấp kỳ mở cửa XOÁ thiết bị trong sổ TBYCNN (mặc định khoá).
-- Thuần additive + idempotent.
ALTER TABLE "tbycnn_periods" ADD COLUMN IF NOT EXISTS "allowItemDeletion" BOOLEAN NOT NULL DEFAULT FALSE;
