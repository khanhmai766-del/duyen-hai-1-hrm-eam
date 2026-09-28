-- Thêm dấu vết TC/TK kiểm tra ảnh hiện trường ở đầu bước Nghiệm thu.
-- Chỉ bổ sung cột, không cập nhật hay xoá dữ liệu phiếu hiện có.
ALTER TABLE "MaterialTicket"
  ADD COLUMN IF NOT EXISTS "usagePhotoReviewStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "usagePhotoReviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "usagePhotoReviewedById" TEXT,
  ADD COLUMN IF NOT EXISTS "usagePhotoReviewedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "usagePhotoReviewedPosition" TEXT;
