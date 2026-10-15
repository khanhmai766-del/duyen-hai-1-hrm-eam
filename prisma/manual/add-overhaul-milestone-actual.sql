-- Thực tế so với đường găng SCL S2 (15/10/2026): cột thực tế trên mốc + bảng nhật ký cập nhật.
-- Chỉ thêm cấu trúc, KHÔNG chạm dữ liệu; chạy lại không hỏng.
ALTER TABLE "OverhaulMilestone"
  ADD COLUMN IF NOT EXISTS "actualStart" DATE,
  ADD COLUMN IF NOT EXISTS "actualEnd" DATE,
  ADD COLUMN IF NOT EXISTS "actualPercent" INTEGER,
  ADD COLUMN IF NOT EXISTS "actualNote" TEXT,
  ADD COLUMN IF NOT EXISTS "actualUpdatedById" TEXT,
  ADD COLUMN IF NOT EXISTS "actualUpdatedAt" TIMESTAMP(3);
CREATE TABLE IF NOT EXISTS "OverhaulMilestoneProgress" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "milestoneId" TEXT NOT NULL,
  "reportDate" DATE NOT NULL,
  "actualStart" DATE,
  "actualEnd" DATE,
  "percent" INTEGER NOT NULL,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OverhaulMilestoneProgress_milestoneId_reportDate_idx" ON "OverhaulMilestoneProgress"("milestoneId", "reportDate");
