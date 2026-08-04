-- Bản bóc tách có cấu trúc của "Tiến trình tách lưới" / "Tiến trình khởi động".
-- Cột `progress` (văn bản gốc) giữ nguyên vĩnh viễn, không đụng tới.
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "timelineJson" TEXT;
