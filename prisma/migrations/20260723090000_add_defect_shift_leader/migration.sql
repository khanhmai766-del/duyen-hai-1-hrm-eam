ALTER TABLE "Defect"
  ADD COLUMN IF NOT EXISTS "shiftLeaderId" TEXT,
  ADD COLUMN IF NOT EXISTS "shiftLeaderName" TEXT;

CREATE INDEX IF NOT EXISTS "Defect_shiftLeaderId_idx" ON "Defect"("shiftLeaderId");
