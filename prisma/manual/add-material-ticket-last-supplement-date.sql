-- Ngày thay/bổ sung gần nhất do VHV nhập ở bước sử dụng; phiếu cũ giữ null.
ALTER TABLE "MaterialTicket"
  ADD COLUMN IF NOT EXISTS "lastSupplementDate" DATE;
