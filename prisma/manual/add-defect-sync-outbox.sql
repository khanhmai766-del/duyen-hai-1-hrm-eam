CREATE TABLE IF NOT EXISTS "DefectSyncOutbox" (
  "id" TEXT NOT NULL,
  "defectId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DefectSyncOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DefectSyncOutbox_eventType_check"
    CHECK ("eventType" IN ('CREATE', 'UPDATE', 'REMIND')),
  CONSTRAINT "DefectSyncOutbox_status_check"
    CHECK ("status" IN ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED')),
  CONSTRAINT "DefectSyncOutbox_attemptCount_check"
    CHECK ("attemptCount" >= 0)
);

CREATE INDEX IF NOT EXISTS "DefectSyncOutbox_status_nextAttemptAt_createdAt_idx"
  ON "DefectSyncOutbox" ("status", "nextAttemptAt", "createdAt");

CREATE INDEX IF NOT EXISTS "DefectSyncOutbox_defectId_createdAt_idx"
  ON "DefectSyncOutbox" ("defectId", "createdAt");
