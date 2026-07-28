ALTER TABLE "Defect"
  ADD COLUMN IF NOT EXISTS "websiteCreated" BOOLEAN NOT NULL DEFAULT false;

-- Phiếu có sự kiện CREATE trong outbox chắc chắn được khởi tạo trên website.
UPDATE "Defect" AS defect
SET
  "websiteCreated" = true,
  "sourceType" = CASE
    WHEN defect."sourceKey" IS NOT NULL THEN 'GOOGLE_SHEETS'
    ELSE defect."sourceType"
  END
WHERE EXISTS (
  SELECT 1
  FROM "DefectSyncOutbox" AS outbox
  WHERE outbox."defectId" = defect.id
    AND outbox."eventType" = 'CREATE'
);
