CREATE TABLE IF NOT EXISTS "DefectHistoryPending" (
  "id" TEXT NOT NULL,
  "defectId" TEXT NOT NULL,
  "workOrderNumber" TEXT,
  "requestType" TEXT,
  "performedAt" TIMESTAMP(3) NOT NULL,
  "content" TEXT,
  "result" TEXT,
  "confirmedById" TEXT NOT NULL,
  "confirmedByName" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalizeAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DefectHistoryPending_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DefectHistoryPending_defectId_fkey"
    FOREIGN KEY ("defectId") REFERENCES "Defect"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DefectHistoryPending_defectId_key"
  ON "DefectHistoryPending"("defectId");

CREATE INDEX IF NOT EXISTS "DefectHistoryPending_finalizeAt_idx"
  ON "DefectHistoryPending"("finalizeAt");
