CREATE TABLE IF NOT EXISTS "DefectSyncSetting" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "twoWaySyncEnabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById" TEXT,
  "updatedByName" TEXT,
  CONSTRAINT "DefectSyncSetting_pkey" PRIMARY KEY ("id")
);

-- Luôn có sẵn đúng một dòng singleton, mặc định tắt.
INSERT INTO "DefectSyncSetting" ("id", "twoWaySyncEnabled")
VALUES ('singleton', false)
ON CONFLICT ("id") DO NOTHING;
