-- Phân loại riêng trên mẫu PCT giấy, không thay đổi mã KH/ĐX/SC lịch sử.
ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "sourceClassification" TEXT;
