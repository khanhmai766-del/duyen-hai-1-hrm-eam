-- Ba ảnh hiện trường của bước "Xác nhận sử dụng vật tư", lưu khóa S3.
-- Chỉ THÊM cột, không đụng dữ liệu sẵn có; chạy lại nhiều lần vẫn an toàn.
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "usagePhotoBeforeKey" TEXT;
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "usagePhotoAfterKey"  TEXT;
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "usagePhotoSpecKey"   TEXT;
