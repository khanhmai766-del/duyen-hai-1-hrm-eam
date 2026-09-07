-- Đổi đơn vị cột "chuKyThu" của sổ TBYCNN từ NĂM sang THÁNG (2026-09-07).
--
-- Lý do: hồ sơ có thiết bị chu kỳ 6 hoặc 18 tháng, đơn vị năm không diễn tả được.
-- Dữ liệu nguồn chỉ có 1 / 2 / 3 năm (và 23 dòng trống) → nhân 12 là chính xác tuyệt đối,
-- không tròn số, không mất dữ liệu.
--
-- AN TOÀN KHI CHẠY LẠI: mệnh đề NOT EXISTS chốt điều kiện "cả bảng vẫn còn theo năm"
-- (mọi giá trị <= 6). Chạy xong thì giá trị nhỏ nhất là 12 nên lần chạy thứ hai không
-- đổi dòng nào. Cũng vì thế nó là ĐƯỢC ĂN CẢ NGÃ VỀ KHÔNG: hoặc đổi hết, hoặc không đổi
-- dòng nào — không có trạng thái nửa vời năm lẫn tháng.
UPDATE "tbycnn_equipments"
SET "chuKyThu" = "chuKyThu" * 12
WHERE "chuKyThu" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "tbycnn_equipments" WHERE "chuKyThu" > 6
  );
