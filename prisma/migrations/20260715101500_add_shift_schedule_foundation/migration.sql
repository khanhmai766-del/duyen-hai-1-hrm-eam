CREATE TYPE "StaffingChangeType" AS ENUM ('ASSIGN_POSITION', 'REMOVE_POSITION', 'TRANSFER_POSITION', 'MOVE_TO_OFFICE', 'CHANGE_CREW', 'CHANGE_STATION');
CREATE TYPE "ShiftScheduleVersionStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'SUPERSEDED');
CREATE TYPE "ShiftScheduleEntrySource" AS ENUM ('GENERATED', 'MANUAL');

CREATE TABLE "CrewRotationConfig" (
  "id" TEXT NOT NULL, "positionConfigId" TEXT NOT NULL, "crewCode" TEXT NOT NULL,
  "rotationTemplateId" TEXT NOT NULL, "cycleStartDate" DATE NOT NULL,
  "effectiveFrom" DATE NOT NULL, "effectiveTo" DATE, "reason" TEXT NOT NULL,
  "createdById" TEXT NOT NULL, "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrewRotationConfig_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CrewRotationConfig_positionConfigId_crewCode_effectiveFrom_effectiveTo_idx" ON "CrewRotationConfig"("positionConfigId", "crewCode", "effectiveFrom", "effectiveTo");
CREATE INDEX "CrewRotationConfig_rotationTemplateId_idx" ON "CrewRotationConfig"("rotationTemplateId");

CREATE TABLE "StaffingChangeEvent" (
  "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "changeType" "StaffingChangeType" NOT NULL,
  "sourcePositionId" TEXT, "targetPositionId" TEXT, "effectiveDate" DATE NOT NULL,
  "reason" TEXT NOT NULL, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffingChangeEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StaffingChangeEvent_effectiveDate_idx" ON "StaffingChangeEvent"("effectiveDate");
CREATE INDEX "StaffingChangeEvent_sourcePositionId_targetPositionId_idx" ON "StaffingChangeEvent"("sourcePositionId", "targetPositionId");
CREATE INDEX "StaffingChangeEvent_employeeId_idx" ON "StaffingChangeEvent"("employeeId");

CREATE TABLE "ShiftScheduleVersion" (
  "id" TEXT NOT NULL, "unit" TEXT NOT NULL, "year" INTEGER NOT NULL, "month" INTEGER NOT NULL,
  "versionNumber" INTEGER NOT NULL, "status" "ShiftScheduleVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "generatedFromDate" DATE NOT NULL, "basedOnVersionId" TEXT, "generationReason" TEXT NOT NULL,
  "generationWarnings" JSONB, "createdById" TEXT NOT NULL, "approvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "approvedAt" TIMESTAMP(3), "publishedAt" TIMESTAMP(3),
  CONSTRAINT "ShiftScheduleVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShiftScheduleVersion_unit_year_month_versionNumber_key" ON "ShiftScheduleVersion"("unit", "year", "month", "versionNumber");
CREATE INDEX "ShiftScheduleVersion_year_month_status_idx" ON "ShiftScheduleVersion"("year", "month", "status");

CREATE TABLE "ShiftScheduleEntry" (
  "id" TEXT NOT NULL, "scheduleVersionId" TEXT NOT NULL, "date" DATE NOT NULL,
  "shiftType" "ShiftType" NOT NULL, "positionConfigId" TEXT NOT NULL, "stationCode" "ShiftSlot",
  "employeeId" TEXT NOT NULL, "source" "ShiftScheduleEntrySource" NOT NULL DEFAULT 'GENERATED',
  "isLocked" BOOLEAN NOT NULL DEFAULT false, "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShiftScheduleEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShiftScheduleEntry_scheduleVersionId_date_shiftType_positionConfigId_employeeId_key" ON "ShiftScheduleEntry"("scheduleVersionId", "date", "shiftType", "positionConfigId", "employeeId");
CREATE INDEX "ShiftScheduleEntry_scheduleVersionId_date_shiftType_idx" ON "ShiftScheduleEntry"("scheduleVersionId", "date", "shiftType");
CREATE INDEX "ShiftScheduleEntry_employeeId_date_idx" ON "ShiftScheduleEntry"("employeeId", "date");

ALTER TABLE "CrewRotationConfig" ADD CONSTRAINT "CrewRotationConfig_positionConfigId_fkey" FOREIGN KEY ("positionConfigId") REFERENCES "ShiftPositionConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrewRotationConfig" ADD CONSTRAINT "CrewRotationConfig_rotationTemplateId_fkey" FOREIGN KEY ("rotationTemplateId") REFERENCES "RotationTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrewRotationConfig" ADD CONSTRAINT "CrewRotationConfig_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrewRotationConfig" ADD CONSTRAINT "CrewRotationConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffingChangeEvent" ADD CONSTRAINT "StaffingChangeEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftScheduleVersion" ADD CONSTRAINT "ShiftScheduleVersion_basedOnVersionId_fkey" FOREIGN KEY ("basedOnVersionId") REFERENCES "ShiftScheduleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShiftScheduleVersion" ADD CONSTRAINT "ShiftScheduleVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftScheduleVersion" ADD CONSTRAINT "ShiftScheduleVersion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShiftScheduleEntry" ADD CONSTRAINT "ShiftScheduleEntry_scheduleVersionId_fkey" FOREIGN KEY ("scheduleVersionId") REFERENCES "ShiftScheduleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftScheduleEntry" ADD CONSTRAINT "ShiftScheduleEntry_positionConfigId_fkey" FOREIGN KEY ("positionConfigId") REFERENCES "ShiftPositionConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
