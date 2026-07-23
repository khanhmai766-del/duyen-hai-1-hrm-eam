CREATE TABLE IF NOT EXISTS "EquipmentBranchClassification" (
  "id" TEXT NOT NULL,
  "systemSeq" TEXT NOT NULL,
  "block" TEXT,
  "managingPosition" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipmentBranchClassification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EquipmentBranchClassification_systemSeq_key"
  ON "EquipmentBranchClassification" ("systemSeq");
CREATE INDEX IF NOT EXISTS "EquipmentBranchClassification_block_idx"
  ON "EquipmentBranchClassification" ("block");
CREATE INDEX IF NOT EXISTS "EquipmentBranchClassification_managingPosition_idx"
  ON "EquipmentBranchClassification" ("managingPosition");
