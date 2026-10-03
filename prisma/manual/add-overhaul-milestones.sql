-- Chỉ bổ sung cấu trúc lưu lịch SCL; không nạp hoặc sửa dữ liệu hiện có.
CREATE TABLE IF NOT EXISTS "OverhaulMilestone" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "campaign" TEXT NOT NULL DEFAULT 'S2-2026',
  "sourceKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE,
  "note" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "OverhaulMilestone_date_order" CHECK ("endDate" IS NULL OR "endDate" >= "startDate")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OverhaulMilestone_campaign_sourceKey_key" ON "OverhaulMilestone"("campaign", "sourceKey");
CREATE INDEX IF NOT EXISTS "OverhaulMilestone_campaign_startDate_idx" ON "OverhaulMilestone"("campaign", "startDate");
