-- Chức vụ người cấp phiếu (in trên mẫu PCT Điện). Không phá dữ liệu: chỉ thêm cột, mặc định rỗng.
ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "issuerPosition" TEXT NOT NULL DEFAULT '';
