ALTER TABLE "Defect"
  DROP COLUMN IF EXISTS "createdPosition",
  DROP COLUMN IF EXISTS "updatedPosition";

ALTER TABLE "DefectHistory"
  DROP COLUMN IF EXISTS "performedPosition";

ALTER TABLE "MaterialReplacement"
  DROP COLUMN IF EXISTS "createdPosition",
  DROP COLUMN IF EXISTS "updatedPosition";

ALTER TABLE "MaterialReplacementLog"
  DROP COLUMN IF EXISTS "doneByPosition";
