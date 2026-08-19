-- Áp suất/KL bình chữa cháy: chuỗi chọn sẵn -> SỐ PHẦN TRĂM (0-100).
--
-- Các nấc "1/4..4/4 mức đỏ" và "KL hao hụt nhiều" mô tả vị trí kim trong vùng đỏ chứ
-- không phải một số đo được, nên không có phần trăm nào đúng cho chúng. Nghiệp vụ chốt
-- 2026-08-19: đặt 100% + Đạt làm MỐC KHỞI ĐIỂM rồi nhắc người kiểm tra nhập lại số thật,
-- thay vì để trống. Giá trị cũ được giữ nguyên văn trong cột ghi chú để còn đối chiếu
-- xem bình nào cần đo lại.
--
-- "Hết áp" giữ nguyên 0% và KHÔNG đụng tới tình trạng: đó là kết quả kiểm tra rõ ràng
-- của một bình đã mất khả năng chữa cháy, ghi đè thành Đạt là xoá một cảnh báo có thật.
ALTER TABLE "pccc_extinguishers" ADD COLUMN IF NOT EXISTS "apSuatPct" DOUBLE PRECISION;

UPDATE "pccc_extinguishers"
SET "ghiChu" = COALESCE(NULLIF("ghiChu", '') || ' | ', '') || 'Áp suất kỳ trước: ' || "apSuat"
             || ' — cần nhập lại số phần trăm thực tế'
WHERE "apSuat" IS NOT NULL
  AND "apSuat" NOT IN ('Đủ áp', 'Đúng theo khối lượng', 'Hết áp')
  AND ("ghiChu" IS NULL OR "ghiChu" NOT LIKE '%Áp suất kỳ trước:%');

-- Mốc khởi điểm cho các nấc không quy đổi được.
UPDATE "pccc_extinguishers"
SET "tinhTrang" = 'Đạt'
WHERE "apSuat" IS NOT NULL
  AND "apSuat" NOT IN ('Đủ áp', 'Đúng theo khối lượng', 'Hết áp');

UPDATE "pccc_extinguishers"
SET "apSuatPct" = CASE "apSuat"
  WHEN 'Hết áp' THEN 0
  ELSE 100
END
WHERE "apSuat" IS NOT NULL;

ALTER TABLE "pccc_extinguishers" DROP COLUMN "apSuat";
ALTER TABLE "pccc_extinguishers" RENAME COLUMN "apSuatPct" TO "apSuat";
