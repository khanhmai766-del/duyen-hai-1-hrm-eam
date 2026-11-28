-- Liên kết tay dòng Excel ↔ điểm theo dõi ở trang Theo dõi dầu mỡ (idempotent).
CREATE TABLE IF NOT EXISTS "LubricantRowLink" (
  "sourceKey" TEXT PRIMARY KEY,
  "replacementId" TEXT NULL,
  "mode" TEXT NOT NULL CHECK ("mode" IN ('point', 'excel', 'none')),
  "updatedById" TEXT NOT NULL,
  "updatedByName" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
