CREATE TABLE IF NOT EXISTS "shn_ppa_records" (
  "id" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "fileNames" TEXT[] NOT NULL,
  "month" INTEGER,
  "year" INTEGER,
  "dayFrom" INTEGER,
  "dayTo" INTEGER,
  "syncStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "syncMessage" TEXT,
  "resultCount" INTEGER NOT NULL DEFAULT 0,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shn_ppa_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shn_ppa_records_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "shn_ppa_records_createdAt_idx" ON "shn_ppa_records"("createdAt");
CREATE INDEX IF NOT EXISTS "shn_ppa_records_expiresAt_idx" ON "shn_ppa_records"("expiresAt");
CREATE INDEX IF NOT EXISTS "shn_ppa_records_createdById_createdAt_idx" ON "shn_ppa_records"("createdById", "createdAt");

CREATE TABLE IF NOT EXISTS "shn_ppa_tool_versions" (
  "id" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shn_ppa_tool_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shn_ppa_tool_versions_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "shn_ppa_tool_versions_contentHash_key" ON "shn_ppa_tool_versions"("contentHash");
CREATE INDEX IF NOT EXISTS "shn_ppa_tool_versions_isActive_createdAt_idx" ON "shn_ppa_tool_versions"("isActive", "createdAt");
CREATE INDEX IF NOT EXISTS "shn_ppa_tool_versions_uploadedById_createdAt_idx" ON "shn_ppa_tool_versions"("uploadedById", "createdAt");
