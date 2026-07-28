-- Dữ liệu lịch sử có thể trùng STT/năm giữa Sheet Cơ và Điện, thậm chí trùng
-- trong cùng Sheet. Chỉ tạo index tra cứu; không ép unique lên dữ liệu cũ.
CREATE INDEX IF NOT EXISTS "Defect_requestNumber_idx"
  ON "Defect" ("requestNumber");

CREATE TABLE IF NOT EXISTS "DefectRequestSequence" (
  "year" INTEGER NOT NULL,
  "requestType" TEXT NOT NULL,
  "currentValue" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DefectRequestSequence_pkey" PRIMARY KEY ("year", "requestType"),
  CONSTRAINT "DefectRequestSequence_currentValue_check" CHECK ("currentValue" >= 0)
);

-- Khởi tạo bộ đếm từng năm từ dữ liệu đã có. Chạy lại an toàn và không làm giảm
-- bộ đếm nếu hệ thống đã cấp thêm số sau lần triển khai trước.
INSERT INTO "DefectRequestSequence" ("year", "requestType", "currentValue", "updatedAt")
SELECT
  split_part("requestNumber", '/', 2)::int AS "year",
  COALESCE(NULLIF(TRIM("requestType"), ''), 'Khác') AS "requestType",
  MAX(split_part("requestNumber", '/', 1)::int) AS "currentValue",
  CURRENT_TIMESTAMP
FROM "Defect"
WHERE "requestNumber" ~ '^[0-9]+/[0-9]{4}$'
GROUP BY
  split_part("requestNumber", '/', 2)::int,
  COALESCE(NULLIF(TRIM("requestType"), ''), 'Khác')
ON CONFLICT ("year", "requestType") DO UPDATE
SET "currentValue" = GREATEST(
      "DefectRequestSequence"."currentValue",
      EXCLUDED."currentValue"
    ),
    "updatedAt" = CURRENT_TIMESTAMP;
