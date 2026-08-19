-- Áp suất/KL bình chữa cháy: chuỗi chọn sẵn -> SỐ PHẦN TRĂM (0-100).
--
-- Chỉ quy đổi ba giá trị có nghĩa RÕ RÀNG. Các nấc "1/4..4/4 mức đỏ" mô tả vị trí kim
-- trong vùng đỏ chứ không phải một con số đo được, quy sang phần trăm là BỊA số đo cho
-- một hồ sơ kiểm tra sẽ nộp cơ quan PCCC. Những dòng đó để TRỐNG, chờ đo lại; giá trị cũ
-- được giữ nguyên văn trong cột ghi chú nên không mất dấu vết.
ALTER TABLE "pccc_extinguishers" ADD COLUMN IF NOT EXISTS "apSuatPct" DOUBLE PRECISION;

UPDATE "pccc_extinguishers"
SET "ghiChu" = COALESCE(NULLIF("ghiChu", '') || ' | ', '') || 'Áp suất kỳ trước: ' || "apSuat"
WHERE "apSuat" IS NOT NULL
  AND "apSuat" NOT IN ('Đủ áp', 'Đúng theo khối lượng', 'Hết áp')
  AND ("ghiChu" IS NULL OR "ghiChu" NOT LIKE '%Áp suất kỳ trước:%');

UPDATE "pccc_extinguishers"
SET "apSuatPct" = CASE "apSuat"
  WHEN 'Đủ áp' THEN 100
  WHEN 'Đúng theo khối lượng' THEN 100
  WHEN 'Hết áp' THEN 0
  ELSE NULL
END
WHERE "apSuat" IS NOT NULL;

ALTER TABLE "pccc_extinguishers" DROP COLUMN "apSuat";
ALTER TABLE "pccc_extinguishers" RENAME COLUMN "apSuatPct" TO "apSuat";
