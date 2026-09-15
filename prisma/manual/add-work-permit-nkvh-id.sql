-- Chỉ bổ sung ID phiếu NKVH; không ghi đè dữ liệu hay ghép theo số PCT.
ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "nkvhPctId" UUID;
