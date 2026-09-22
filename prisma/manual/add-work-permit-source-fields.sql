-- Bổ sung dữ liệu phiếu giấy; không sửa dữ liệu phiếu hiện hữu.
ALTER TABLE "WorkPermit"
  ADD COLUMN IF NOT EXISTS "managingUnit" TEXT NOT NULL DEFAULT 'Phân xưởng Vận hành 1',
  ADD COLUMN IF NOT EXISTS "plantName" TEXT NOT NULL DEFAULT 'Duyên Hải 1';
