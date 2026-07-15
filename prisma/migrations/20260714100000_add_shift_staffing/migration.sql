CREATE TYPE "ShiftPositionType" AS ENUM ('SINGLE', 'S1_S2');
CREATE TYPE "ShiftCrew" AS ENUM ('A', 'B', 'C', 'D', 'E');
CREATE TYPE "ShiftSlot" AS ENUM ('S1', 'S2');
CREATE TYPE "ShiftStaffingType" AS ENUM ('OFFICIAL', 'BACKUP', 'TRAINING', 'TEMPORARY', 'ADMINISTRATIVE');
CREATE TYPE "ShiftStaffingStatus" AS ENUM ('ACTIVE', 'ENDED');

CREATE TABLE "ShiftPositionConfig" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "requiredPerShift" INTEGER,
  "positionType" "ShiftPositionType", "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL, "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShiftPositionConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShiftPositionConfig_required_check" CHECK (("requiredPerShift" IS NULL AND "positionType" IS NULL) OR ("requiredPerShift" = 1 AND "positionType" = 'SINGLE') OR ("requiredPerShift" = 2 AND "positionType" = 'S1_S2'))
);
CREATE TABLE "ShiftStaffingAssignment" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "positionId" TEXT NOT NULL,
  "crew" "ShiftCrew", "slot" "ShiftSlot", "assignmentType" "ShiftStaffingType" NOT NULL,
  "startDate" DATE NOT NULL, "endDate" DATE, "status" "ShiftStaffingStatus" NOT NULL DEFAULT 'ACTIVE',
  "changeReason" TEXT NOT NULL, "note" TEXT, "createdById" TEXT NOT NULL, "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShiftStaffingAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShiftStaffingAssignment_dates_check" CHECK ("endDate" IS NULL OR "startDate" <= "endDate")
);
CREATE UNIQUE INDEX "ShiftPositionConfig_name_key" ON "ShiftPositionConfig"("name");
CREATE INDEX "ShiftPositionConfig_isActive_idx" ON "ShiftPositionConfig"("isActive");
CREATE INDEX "ShiftStaffingAssignment_positionId_startDate_endDate_idx" ON "ShiftStaffingAssignment"("positionId", "startDate", "endDate");
CREATE INDEX "ShiftStaffingAssignment_userId_assignmentType_startDate_endDate_idx" ON "ShiftStaffingAssignment"("userId", "assignmentType", "startDate", "endDate");
CREATE INDEX "ShiftStaffingAssignment_status_idx" ON "ShiftStaffingAssignment"("status");
ALTER TABLE "ShiftPositionConfig" ADD CONSTRAINT "ShiftPositionConfig_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftPositionConfig" ADD CONSTRAINT "ShiftPositionConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftStaffingAssignment" ADD CONSTRAINT "ShiftStaffingAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftStaffingAssignment" ADD CONSTRAINT "ShiftStaffingAssignment_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "ShiftPositionConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftStaffingAssignment" ADD CONSTRAINT "ShiftStaffingAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftStaffingAssignment" ADD CONSTRAINT "ShiftStaffingAssignment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
