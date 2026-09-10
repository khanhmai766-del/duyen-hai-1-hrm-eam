-- Hình thức độc lập với loại đơn vị; phiếu cũ chưa có lựa chọn riêng giữ NULL.
ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "format" TEXT;
