-- Bước F (tự động chốt kỳ + lưu trữ S3): thêm cột lưu vết bản Excel đã đẩy lên S3.
-- CHỈ THÊM CỘT, không đụng dữ liệu nào đang có, chạy lại nhiều lần vẫn an toàn.
--
-- KHÔNG dùng `prisma db push` trên DB này (xem docs/pccc.md mục 4.2 — db push sẽ DROP
-- 9 bảng ShiftSchedule*/Rotation*/Staffing* đang tồn tại trong DB mà không có trong schema).
-- Chạy: npx prisma db execute --file scripts/sql/pccc_archive.sql --schema prisma/schema.prisma

ALTER TABLE "pccc_periods"
  ADD COLUMN IF NOT EXISTS "archiveKey" TEXT,
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archiveBytes" INTEGER;
