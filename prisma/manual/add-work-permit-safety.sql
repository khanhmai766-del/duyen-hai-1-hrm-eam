-- Danh mục an toàn và bản sao nội dung trên PCT; không thay đổi dữ liệu phiếu cũ.
BEGIN;
CREATE TABLE IF NOT EXISTS "WorkPermitSafetyMeasure" (
  "id" TEXT PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "hazard" TEXT NOT NULL DEFAULT '',
  "measure" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT '',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "searchText" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "WorkPermitSafetyMeasure_kind_isActive_idx" ON "WorkPermitSafetyMeasure"("kind", "isActive");
ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "safetyItems" JSONB NOT NULL DEFAULT '[]';
COMMIT;
