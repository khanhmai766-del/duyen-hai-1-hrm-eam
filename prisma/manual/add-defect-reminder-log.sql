CREATE TABLE IF NOT EXISTS "DefectReminderLog" (
  "id" TEXT NOT NULL,
  "defectId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DefectReminderLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DefectReminderLog_defectId_fkey"
    FOREIGN KEY ("defectId") REFERENCES "Defect"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DefectReminderLog_defectId_occurredAt_idx"
  ON "DefectReminderLog" ("defectId", "occurredAt");
