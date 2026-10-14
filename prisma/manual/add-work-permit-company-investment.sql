-- Nhóm nhà thầu Đầu tư (dự án đầu tư, 14/10/2026): đơn vị tick "Đầu tư" được cấp PCT nhà thầu nhóm Đầu tư
-- (cấp phiếu, QR, quét thẻ như Đại tu; không dùng hạng mục đại tu). Chỉ thêm cột, KHÔNG chạm dữ liệu:
-- chuyển đơn vị / nhân sự sang nhóm Đầu tư (vd NARIME) làm riêng, có chủ đích.
ALTER TABLE "WorkPermitCompany" ADD COLUMN IF NOT EXISTS "investment" BOOLEAN NOT NULL DEFAULT false;
