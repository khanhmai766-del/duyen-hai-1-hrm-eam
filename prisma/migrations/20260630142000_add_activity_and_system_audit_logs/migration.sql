DO $$ BEGIN
  CREATE TYPE "ActivityLogCategory" AS ENUM ('SYSTEM', 'SECURITY', 'ATTENDANCE', 'USER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "AuditLog"
ADD COLUMN IF NOT EXISTS "category" "ActivityLogCategory" NOT NULL DEFAULT 'USER';

CREATE TABLE IF NOT EXISTS "system_audit_logs" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "beforeData" JSONB,
  "afterData" JSONB,
  "changedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "system_audit_logs_createdAt_idx" ON "system_audit_logs"("createdAt");
CREATE INDEX IF NOT EXISTS "system_audit_logs_actorUserId_idx" ON "system_audit_logs"("actorUserId");
CREATE INDEX IF NOT EXISTS "system_audit_logs_action_idx" ON "system_audit_logs"("action");
