ALTER TABLE "Defect"
ADD COLUMN IF NOT EXISTS "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Defect"
SET "images" = ARRAY["imageUrl"]
WHERE "imageUrl" IS NOT NULL
  AND "imageUrl" <> ''
  AND cardinality("images") = 0;
