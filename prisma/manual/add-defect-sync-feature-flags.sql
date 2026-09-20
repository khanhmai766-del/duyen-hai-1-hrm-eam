ALTER TABLE "DefectSyncSetting"
ADD COLUMN IF NOT EXISTS "operationUpdateEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS "websiteCreateEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS "websiteRemindEnabled" BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO "DefectSyncSetting" (
  "id",
  "twoWaySyncEnabled",
  "operationUpdateEnabled",
  "websiteCreateEnabled",
  "websiteRemindEnabled",
  "updatedAt"
)
VALUES ('singleton', FALSE, TRUE, FALSE, FALSE, NOW())
ON CONFLICT ("id") DO UPDATE
SET
  "twoWaySyncEnabled" = FALSE,
  "operationUpdateEnabled" = TRUE,
  "websiteCreateEnabled" = FALSE,
  "websiteRemindEnabled" = FALSE,
  "updatedAt" = NOW();
