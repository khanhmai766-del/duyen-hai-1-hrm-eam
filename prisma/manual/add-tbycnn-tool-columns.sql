-- Cột riêng của 3 bảng dụng cụ ATLĐ trong sổ TBYCNN
-- (Thang di động · Dây đai an toàn · Dụng cụ điện cầm tay).
--
-- Ba bảng này có biểu mẫu riêng nên có cột riêng; trước đây phải ghép chuỗi vào
-- `thongSoKyThuat` / `ghiChu` nên không lọc, không sắp xếp, không đối chiếu được với
-- bản giấy. Xem TBYCNN_TOOL_TABS ở lib/tbycnn.ts.
--
-- Thuần additive và idempotent: chạy lại lần hai không đổi dòng nào.
-- Áp bằng:
--   npx prisma db execute --file prisma/manual/add-tbycnn-tool-columns.sql --schema prisma/schema.prisma
-- KHÔNG dùng `prisma db push` trên DB dev/prod: nó đồng bộ cả schema và đòi drop các
-- bảng ngoài schema của nhánh này (xem CLAUDE.md).

ALTER TABLE "tbycnn_equipments" ADD COLUMN IF NOT EXISTS "taiTrongThuKg"       DOUBLE PRECISION;
ALTER TABLE "tbycnn_equipments" ADD COLUMN IF NOT EXISTS "thoiGianThuPhut"     INTEGER;
ALTER TABLE "tbycnn_equipments" ADD COLUMN IF NOT EXISTS "tinhTrangSuDung"     TEXT;
ALTER TABLE "tbycnn_equipments" ADD COLUMN IF NOT EXISTS "kiemTraBangMat"      TEXT;
ALTER TABLE "tbycnn_equipments" ADD COLUMN IF NOT EXISTS "cachDienMOhm"        DOUBLE PRECISION;
ALTER TABLE "tbycnn_equipments" ADD COLUMN IF NOT EXISTS "ketQuaThu"           TEXT;
ALTER TABLE "tbycnn_equipments" ADD COLUMN IF NOT EXISTS "nghiemThuSauSuaChua" TEXT;
