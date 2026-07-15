ALTER TABLE "ShiftPositionConfig"
  ADD COLUMN "requiredMorningStaff" INTEGER,
  ADD COLUMN "requiredAfternoonStaff" INTEGER,
  ADD COLUMN "requiredNightStaff" INTEGER;
UPDATE "ShiftPositionConfig" SET "requiredMorningStaff" = "requiredPerShift", "requiredAfternoonStaff" = "requiredPerShift", "requiredNightStaff" = "requiredPerShift";
ALTER TABLE "ShiftPositionConfig" ADD CONSTRAINT "ShiftPositionConfig_coverage_check" CHECK (
  ("requiredMorningStaff" IS NULL AND "requiredAfternoonStaff" IS NULL AND "requiredNightStaff" IS NULL)
  OR ("requiredMorningStaff" >= 0 AND "requiredAfternoonStaff" >= 0 AND "requiredNightStaff" >= 0 AND ("requiredMorningStaff" + "requiredAfternoonStaff" + "requiredNightStaff") > 0)
);

ALTER TYPE "ShiftSlot" ADD VALUE IF NOT EXISTS 'FLEX';
ALTER TABLE "ShiftStaffingAssignment" RENAME COLUMN "crew" TO "crewCode";
ALTER TABLE "ShiftStaffingAssignment" ALTER COLUMN "crewCode" TYPE TEXT USING "crewCode"::text;
ALTER TABLE "ShiftStaffingAssignment" RENAME COLUMN "slot" TO "stationCode";
ALTER TABLE "ShiftStaffingAssignment" ADD COLUMN "phaseIndex" INTEGER;
ALTER TABLE "ShiftStaffingAssignment" ADD CONSTRAINT "ShiftStaffingAssignment_phase_check" CHECK ("phaseIndex" IS NULL OR "phaseIndex" >= 0);
CREATE INDEX "ShiftStaffingAssignment_positionId_phaseIndex_idx" ON "ShiftStaffingAssignment"("positionId", "phaseIndex");
DROP TYPE "ShiftCrew";

CREATE TABLE "RotationTemplate" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "cycleLength" INTEGER NOT NULL,
  "cyclePattern" JSONB NOT NULL, "description" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT, "updatedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RotationTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RotationTemplate_cycle_length_check" CHECK ("cycleLength" > 0 AND jsonb_array_length("cyclePattern") = "cycleLength")
);
CREATE UNIQUE INDEX "RotationTemplate_code_key" ON "RotationTemplate"("code");
CREATE INDEX "RotationTemplate_isActive_idx" ON "RotationTemplate"("isActive");
ALTER TABLE "RotationTemplate" ADD CONSTRAINT "RotationTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RotationTemplate" ADD CONSTRAINT "RotationTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PositionRotationAssignment" (
  "id" TEXT NOT NULL, "positionConfigId" TEXT NOT NULL, "rotationTemplateId" TEXT NOT NULL,
  "effectiveFrom" DATE NOT NULL, "effectiveTo" DATE, "reason" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL, "updatedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PositionRotationAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PositionRotationAssignment_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" <= "effectiveTo")
);
CREATE INDEX "PositionRotationAssignment_positionConfigId_effectiveFrom_effectiveTo_idx" ON "PositionRotationAssignment"("positionConfigId", "effectiveFrom", "effectiveTo");
CREATE INDEX "PositionRotationAssignment_rotationTemplateId_idx" ON "PositionRotationAssignment"("rotationTemplateId");
ALTER TABLE "PositionRotationAssignment" ADD CONSTRAINT "PositionRotationAssignment_positionConfigId_fkey" FOREIGN KEY ("positionConfigId") REFERENCES "ShiftPositionConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PositionRotationAssignment" ADD CONSTRAINT "PositionRotationAssignment_rotationTemplateId_fkey" FOREIGN KEY ("rotationTemplateId") REFERENCES "RotationTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PositionRotationAssignment" ADD CONSTRAINT "PositionRotationAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PositionRotationAssignment" ADD CONSTRAINT "PositionRotationAssignment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "RotationTemplate" ("id", "code", "name", "cycleLength", "cyclePattern", "description") VALUES
('rotation-template-4k-single-day', '4K_SINGLE_DAY', '4 kíp – đổi ca mỗi ngày', 4, '["MORNING","AFTERNOON","NIGHT","OFF"]', 'Đổi ca sau mỗi ngày làm việc'),
('rotation-template-4k-double-day', '4K_DOUBLE_DAY', '4 kíp – hai ngày liên tiếp cùng ca', 8, '["MORNING","MORNING","AFTERNOON","AFTERNOON","NIGHT","NIGHT","OFF","OFF"]', 'Hai ngày liên tiếp cùng ca'),
('rotation-template-45k-single-day', '45K_SINGLE_DAY', '4,5 kíp – đổi ca mỗi ngày', 9, '["MORNING","AFTERNOON","NIGHT","OFF","MORNING","AFTERNOON","NIGHT","OFF","OFF"]', 'Mẫu 4,5 kíp đổi ca mỗi ngày'),
('rotation-template-45k-double-day', '45K_DOUBLE_DAY', '4,5 kíp – hai ngày liên tiếp cùng ca', 9, '["MORNING","MORNING","AFTERNOON","AFTERNOON","NIGHT","NIGHT","OFF","OFF","OFF"]', 'Mẫu 4,5 kíp hai ngày cùng ca'),
('rotation-template-5k-standard', '5K_STANDARD', '5 kíp tiêu chuẩn', 5, '["MORNING","AFTERNOON","NIGHT","OFF","OFF"]', 'Mẫu năm kíp tiêu chuẩn'),
('rotation-template-55k-standard', '55K_STANDARD', '5,5 kíp tiêu chuẩn', 11, '["MORNING","AFTERNOON","NIGHT","OFF","OFF","MORNING","AFTERNOON","NIGHT","OFF","OFF","OFF"]', 'Mẫu 5,5 kíp tiêu chuẩn'),
('rotation-template-6k-tbnt', '6K_TBNT', '6 kíp Trạm bơm nước thô', 6, '["MORNING","AFTERNOON","NIGHT","OFF","OFF","OFF"]', 'Mẫu dành cho Trạm bơm nước thô'),
('rotation-template-6k-xlnhh', '6K_XLNHH', '6 kíp XLN hỗn hợp', 6, '["MORNING","MORNING","AFTERNOON","NIGHT","OFF","OFF"]', 'Mẫu dành cho XLN hỗn hợp')
ON CONFLICT ("code") DO NOTHING;
