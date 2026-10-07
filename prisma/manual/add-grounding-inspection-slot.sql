-- Chỉ thêm ngày/ca cho lượt kiểm tra mới; giữ nguyên lịch sử và giờ ký cũ.
ALTER TABLE "grounding_lightning_inspections"
  ADD COLUMN IF NOT EXISTS "inspectionDate" TEXT,
  ADD COLUMN IF NOT EXISTS "inspectionShift" TEXT;
