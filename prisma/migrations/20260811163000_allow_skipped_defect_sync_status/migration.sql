ALTER TABLE "DefectSyncOutbox"
  DROP CONSTRAINT IF EXISTS "DefectSyncOutbox_status_check";

ALTER TABLE "DefectSyncOutbox"
  ADD CONSTRAINT "DefectSyncOutbox_status_check"
  CHECK ("status" IN ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'SKIPPED'));
