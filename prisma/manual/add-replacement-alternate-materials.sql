-- Dầu mỡ thay thế lẫn nhau tại một điểm theo dõi (idempotent).
ALTER TABLE "MaterialReplacement" ADD COLUMN IF NOT EXISTS "alternateMaterialIds" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "MaterialReplacement" ADD COLUMN IF NOT EXISTS "lubricantGroup" TEXT;
