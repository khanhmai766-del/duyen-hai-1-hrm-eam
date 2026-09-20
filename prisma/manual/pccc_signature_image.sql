-- Chữ ký PCCC dùng ẢNH CHỮ KÝ SỐ của user (đã có sẵn trong S3 qua trang Tài khoản).
-- Lưu S3 key ngay trên bản ghi chữ ký, cùng lý do với việc chốt cứng `signerName`:
-- user đổi/xoá chữ ký trong hồ sơ thì bản ký cũ vẫn phải hiện đúng cái đã ký.
--
-- CHỈ THÊM CỘT, chạy lại nhiều lần vẫn an toàn.
-- KHÔNG dùng `prisma db push` trên DB này (xem docs/pccc.md mục 4.2).
-- Chạy: npx prisma db execute --file scripts/sql/pccc_signature_image.sql --schema prisma/schema.prisma

ALTER TABLE "pccc_signatures"
  ADD COLUMN IF NOT EXISTS "signature_key" TEXT;
