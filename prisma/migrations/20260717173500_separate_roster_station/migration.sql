ALTER TABLE "ShiftStaffingAssignment"
  ADD COLUMN IF NOT EXISTS "rosterStation" "ShiftSlot";

UPDATE "ShiftStaffingAssignment"
SET "rosterStation" = CASE
  WHEN "stationCode" = 'FLEX' THEN 'S1'::"ShiftSlot"
  ELSE "stationCode"
END
WHERE "rosterStation" IS NULL;
