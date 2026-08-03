ALTER TABLE "Defect" ADD COLUMN IF NOT EXISTS "isMaterialRequest" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "DefectMaterialRequest" (
  "id" TEXT NOT NULL,
  "defectId" TEXT NOT NULL,
  "replacementId" TEXT,
  "materialId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "unitLabel" TEXT NOT NULL DEFAULT '',
  "pointLabel" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DefectMaterialRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DefectMaterialRequest_defectId_replacementId_key"
  ON "DefectMaterialRequest"("defectId", "replacementId");
CREATE INDEX IF NOT EXISTS "DefectMaterialRequest_defectId_idx" ON "DefectMaterialRequest"("defectId");
CREATE INDEX IF NOT EXISTS "DefectMaterialRequest_replacementId_idx" ON "DefectMaterialRequest"("replacementId");
CREATE INDEX IF NOT EXISTS "DefectMaterialRequest_materialId_idx" ON "DefectMaterialRequest"("materialId");

DO $$ BEGIN
  ALTER TABLE "DefectMaterialRequest" ADD CONSTRAINT "DefectMaterialRequest_defectId_fkey"
    FOREIGN KEY ("defectId") REFERENCES "Defect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DefectMaterialRequest" ADD CONSTRAINT "DefectMaterialRequest_replacementId_fkey"
    FOREIGN KEY ("replacementId") REFERENCES "MaterialReplacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DefectMaterialRequest" ADD CONSTRAINT "DefectMaterialRequest_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
