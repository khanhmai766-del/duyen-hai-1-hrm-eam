-- Lịch sử bổ sung dầu mỡ nhập tay theo điểm theo dõi (idempotent).
-- Không ghi vào MaterialReplacementLog để khỏi lẫn vào lịch sử thay thế và dự toán năm.
CREATE TABLE IF NOT EXISTS "LubricantSupplement" (
  "id" TEXT PRIMARY KEY,
  "replacementId" TEXT NOT NULL REFERENCES "MaterialReplacement"("id") ON DELETE CASCADE,
  "suppliedAt" TIMESTAMP(3) NOT NULL,
  "quantity" DOUBLE PRECISION NULL,
  "unit" TEXT NULL,
  "materialId" TEXT NULL REFERENCES "Material"("id") ON DELETE SET NULL,
  "note" TEXT NULL,
  "createdById" TEXT NULL,
  "createdByName" TEXT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "LubricantSupplement_replacementId_idx" ON "LubricantSupplement"("replacementId");
