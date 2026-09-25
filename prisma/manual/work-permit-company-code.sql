-- Mã đơn vị (tên gọi tắt) cho đơn vị nhà thầu. Không phá dữ liệu: chỉ thêm cột, mặc định rỗng.
ALTER TABLE "WorkPermitCompany" ADD COLUMN IF NOT EXISTS "code" TEXT NOT NULL DEFAULT '';
