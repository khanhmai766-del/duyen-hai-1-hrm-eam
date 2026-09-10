-- Bổ sung vào sổ PCT đã khởi tạo; giữ null cho phiếu cũ chưa phân loại.
ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "workType" TEXT;
