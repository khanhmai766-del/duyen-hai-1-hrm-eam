ALTER TABLE "ShiftStaffingAssignment"
  ADD COLUMN IF NOT EXISTS "isTrainingRow" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ShiftStaffingAssignment"
SET "isTrainingRow" = true
WHERE "assignmentType" = 'TRAINING';
