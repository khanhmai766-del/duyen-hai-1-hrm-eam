-- Lượt đồng bộ danh bạ nhân sự nhà thầu chạy nền (16/10/2026). Chỉ tạo bảng, không chạm dữ liệu; chạy lại không hỏng.
CREATE TABLE IF NOT EXISTS "WorkPermitPeopleSyncRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "source" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'RUNNING',
  "trigger" TEXT NOT NULL DEFAULT 'MANUAL',
  "startedById" TEXT,
  "startedByName" TEXT NOT NULL DEFAULT '',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "summary" JSONB,
  "photosTotal" INTEGER NOT NULL DEFAULT 0,
  "photosDone" INTEGER NOT NULL DEFAULT 0,
  "photoErrors" JSONB,
  "error" TEXT
);
CREATE INDEX IF NOT EXISTS "WorkPermitPeopleSyncRun_source_startedAt_idx" ON "WorkPermitPeopleSyncRun"("source", "startedAt");
