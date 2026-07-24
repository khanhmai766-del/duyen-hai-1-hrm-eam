ALTER TABLE "Defect"
  ADD COLUMN IF NOT EXISTS "reminderRaw" TEXT,
  ADD COLUMN IF NOT EXISTS "repeatedRepairRaw" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "sourceKey" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceSpreadsheetId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceSheetName" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceRow" INTEGER,
  ADD COLUMN IF NOT EXISTS "sourceDeviceRaw" TEXT,
  ADD COLUMN IF NOT EXISTS "sourcePositionRaw" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceStatusRaw" TEXT,
  ADD COLUMN IF NOT EXISTS "repairResultRaw" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceStatusMismatch" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "postRepairAwaitingMaterial" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sourceCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sourceHash" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceSyncedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sourceLastSeenAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sourceChangedAfterConfirm" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "syncState" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "confirmedById" TEXT,
  ADD COLUMN IF NOT EXISTS "confirmedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "confirmedHistoryId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Defect_sourceKey_key" ON "Defect"("sourceKey");
CREATE INDEX IF NOT EXISTS "Defect_sourceType_syncState_idx" ON "Defect"("sourceType", "syncState");

ALTER TABLE "DefectHistory"
  ADD COLUMN IF NOT EXISTS "reminderRaw" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceKey" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceSnapshot" JSONB;

CREATE TABLE IF NOT EXISTS "DefectSyncRun" (
  "id" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "readCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "unchangedCount" INTEGER NOT NULL DEFAULT 0,
  "confirmedSkippedCount" INTEGER NOT NULL DEFAULT 0,
  "missingCount" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "triggeredById" TEXT,
  "triggeredByName" TEXT,
  CONSTRAINT "DefectSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DefectSyncRun_startedAt_idx" ON "DefectSyncRun"("startedAt");
CREATE INDEX IF NOT EXISTS "DefectSyncRun_status_idx" ON "DefectSyncRun"("status");
