BEGIN;

ALTER TABLE "DefectRequestSequence"
  ADD COLUMN IF NOT EXISTS "requestType" TEXT;

-- Dòng bộ đếm theo năm của phiên bản cũ không được gán cho Cơ hoặc Điện vì hai
-- Sheet có hai dãy STT độc lập. Giữ nó dưới nhãn legacy để có thể đối soát.
UPDATE "DefectRequestSequence"
SET "requestType" = '__LEGACY__'
WHERE "requestType" IS NULL OR TRIM("requestType") = '';

ALTER TABLE "DefectRequestSequence"
  ALTER COLUMN "requestType" SET NOT NULL;

ALTER TABLE "DefectRequestSequence"
  DROP CONSTRAINT IF EXISTS "DefectRequestSequence_pkey";

ALTER TABLE "DefectRequestSequence"
  ADD CONSTRAINT "DefectRequestSequence_pkey"
  PRIMARY KEY ("year", "requestType");

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

COMMIT;
