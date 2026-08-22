-- Nội dung công việc ghi trên PCT/LCT, nhập ở bước Nghiệm thu.
-- Chỉ THÊM cột; chạy lại nhiều lần vẫn an toàn.
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "pctContent" TEXT;
