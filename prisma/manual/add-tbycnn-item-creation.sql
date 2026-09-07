-- Công tắc cấp kỳ "cho phép thêm thiết bị" của sổ TBYCNN — cùng khuôn với
-- prisma/manual/add-pccc-item-creation-lock.sql. Idempotent, chạy lại vô hại.
ALTER TABLE "tbycnn_periods"
ADD COLUMN IF NOT EXISTS "allowItemCreation" BOOLEAN NOT NULL DEFAULT FALSE;
