ALTER TABLE "Defect"
  ADD COLUMN IF NOT EXISTS "positionCode" TEXT;

ALTER TABLE "MaterialReplacement"
  ADD COLUMN IF NOT EXISTS "managingPositionCode" TEXT;

ALTER TABLE "PositionSystemScope"
  ADD COLUMN IF NOT EXISTS "positionCode" TEXT;

CREATE INDEX IF NOT EXISTS "Defect_positionCode_idx"
  ON "Defect" ("positionCode");

CREATE INDEX IF NOT EXISTS "MaterialReplacement_managingPositionCode_idx"
  ON "MaterialReplacement" ("managingPositionCode");

CREATE INDEX IF NOT EXISTS "PositionSystemScope_positionCode_idx"
  ON "PositionSystemScope" ("positionCode");
