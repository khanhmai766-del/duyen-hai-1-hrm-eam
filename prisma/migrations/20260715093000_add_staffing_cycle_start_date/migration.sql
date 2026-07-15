ALTER TABLE "ShiftStaffingAssignment"
  ADD COLUMN IF NOT EXISTS "cycleStartDate" DATE;

CREATE INDEX IF NOT EXISTS "ShiftStaffingAssignment_cycleStartDate_idx"
  ON "ShiftStaffingAssignment"("cycleStartDate");
