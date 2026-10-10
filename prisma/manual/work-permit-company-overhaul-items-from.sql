-- Đơn vị nhà thầu được dùng TOÀN BỘ hạng mục đại tu của nhà thầu khác (10/10/2026) — WorkPermitCompany.overhaulItemsFrom.
-- Chạy được nhiều lần (IF NOT EXISTS + chỉ thêm mã khi chưa có).
ALTER TABLE "WorkPermitCompany" ADD COLUMN IF NOT EXISTS "overhaulItemsFrom" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- S3A (CTy CP Đầu tư và phát triển Sesan3A) dùng hạng mục của EPS (mã chuẩn hoá "eps").
UPDATE "WorkPermitCompany"
SET "overhaulItemsFrom" = array_append("overhaulItemsFrom", 'eps')
WHERE "code" = 'S3A' AND NOT ('eps' = ANY("overhaulItemsFrom"));
