-- Công tắc cấp kỳ mở cửa XOÁ thiết bị trong sổ PCCC (mặc định khoá), cùng khuôn với
-- tbycnn_periods.allowItemDeletion. Thuần additive + idempotent.
ALTER TABLE "pccc_periods" ADD COLUMN IF NOT EXISTS "allowItemDeletion" BOOLEAN NOT NULL DEFAULT FALSE;
