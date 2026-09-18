CREATE TABLE IF NOT EXISTS "SyncMonitor" (
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "expectedIntervalMinutes" INTEGER NOT NULL DEFAULT 0,
  "alertAfterMinutes" INTEGER NOT NULL DEFAULT 30,
  "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "lastStartedAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "lastFailedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "incidentStartedAt" TIMESTAMP(3),
  "alertedAt" TIMESTAMP(3),
  "lastReminderAt" TIMESTAMP(3),
  "recoveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SyncMonitor_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "SyncMonitor_enabled_status_idx"
  ON "SyncMonitor"("enabled", "status");

CREATE TABLE IF NOT EXISTS "TelegramNotificationLog" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramNotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TelegramNotificationLog_type_periodKey_chatId_key"
  ON "TelegramNotificationLog"("type", "periodKey", "chatId");

CREATE INDEX IF NOT EXISTS "TelegramNotificationLog_status_attemptedAt_idx"
  ON "TelegramNotificationLog"("status", "attemptedAt");
