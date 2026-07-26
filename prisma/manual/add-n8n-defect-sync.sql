ALTER TABLE "DefectSyncRun"
  ADD COLUMN IF NOT EXISTS "externalRunId" TEXT,
  ADD COLUMN IF NOT EXISTS "expectedSources" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "completedSources" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX IF NOT EXISTS "DefectSyncRun_externalRunId_key"
  ON "DefectSyncRun"("externalRunId");

CREATE TABLE IF NOT EXISTS "DefectSyncBatch" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "batchNumber" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "recordCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "unchangedCount" INTEGER NOT NULL DEFAULT 0,
  "confirmedSkippedCount" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DefectSyncBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DefectSyncBatch_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "DefectSyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DefectSyncBatch_runId_source_batchNumber_key"
  ON "DefectSyncBatch"("runId", "source", "batchNumber");
CREATE INDEX IF NOT EXISTS "DefectSyncBatch_runId_status_idx"
  ON "DefectSyncBatch"("runId", "status");

CREATE TABLE IF NOT EXISTS "DefectSyncSeen" (
  "runId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DefectSyncSeen_pkey" PRIMARY KEY ("runId", "sourceKey"),
  CONSTRAINT "DefectSyncSeen_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "DefectSyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DefectSyncSeen_runId_source_idx"
  ON "DefectSyncSeen"("runId", "source");
