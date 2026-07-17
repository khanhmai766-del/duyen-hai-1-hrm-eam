ALTER TABLE "ShiftStaffingAssignment"
  ADD COLUMN IF NOT EXISTS "rosterColumn" TEXT;

UPDATE "ShiftStaffingAssignment"
SET "rosterColumn" = "crewCode"
WHERE "rosterColumn" IS NULL;

CREATE INDEX IF NOT EXISTS "ShiftStaffingAssignment_positionId_rosterColumn_idx"
  ON "ShiftStaffingAssignment"("positionId", "rosterColumn");
