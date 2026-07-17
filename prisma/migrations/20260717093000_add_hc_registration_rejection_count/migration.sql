ALTER TABLE "HcCheckIn"
ADD COLUMN IF NOT EXISTS "rejectionCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "HcCheckIn"
SET "rejectionCount" = 1
WHERE "isRegistered" = TRUE
  AND "registrationStatus" = 'REJECTED'
  AND "rejectionCount" = 0;
