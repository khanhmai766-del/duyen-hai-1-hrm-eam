CREATE TABLE "ShiftStaffingAbsence" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShiftStaffingAbsence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShiftStaffingAbsence_assignmentId_startDate_endDate_idx"
ON "ShiftStaffingAbsence"("assignmentId", "startDate", "endDate");

CREATE INDEX "ShiftStaffingAbsence_startDate_endDate_idx"
ON "ShiftStaffingAbsence"("startDate", "endDate");

ALTER TABLE "ShiftStaffingAbsence"
ADD CONSTRAINT "ShiftStaffingAbsence_assignmentId_fkey"
FOREIGN KEY ("assignmentId") REFERENCES "ShiftStaffingAssignment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
