-- Cờ "theo dõi riêng" cho dòng khai báo điểm thay thế (23/09/2026): thiết bị dùng hai loại
-- dầu/lọc KHÁC CHỨC NĂNG thì được phép có hai đồng hồ đếm ngày. Cột additive, mặc định false
-- nên mọi dòng cũ giữ nguyên quy tắc một đồng hồ mỗi thiết bị.
ALTER TABLE "MaterialReplacement" ADD COLUMN IF NOT EXISTS "separateTracking" BOOLEAN NOT NULL DEFAULT false;
