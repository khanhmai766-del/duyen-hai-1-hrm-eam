ALTER TABLE "HcCheckIn"
ADD COLUMN IF NOT EXISTS "registrationStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;

UPDATE "HcCheckIn"
SET "registrationStatus" = CASE
  WHEN "isApproved" = TRUE THEN 'APPROVED'
  ELSE 'PENDING'
END
WHERE "isRegistered" = TRUE;

CREATE INDEX IF NOT EXISTS "HcCheckIn_registrationStatus_idx"
ON "HcCheckIn"("registrationStatus");
