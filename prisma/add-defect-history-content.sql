ALTER TABLE "DefectHistory"
ADD COLUMN IF NOT EXISTS "defectContent" TEXT;

UPDATE "DefectHistory" AS history
SET "defectContent" = defect."content"
FROM "Defect" AS defect
WHERE history."defectId" = defect."id"
  AND history."defectContent" IS NULL;
