-- Dòng khiếm khuyết chưa có STT trên Sheet Cơ/Điện — rà trạng thái cột 14 (10/10/2026).
-- Thuần additive, chạy lại nhiều lần vẫn an toàn.
CREATE TABLE IF NOT EXISTS "DefectUnnumberedRow" (
  "id" TEXT NOT NULL,
  "identityHash" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "spreadsheetId" TEXT NOT NULL,
  "sheetName" TEXT NOT NULL,
  "sourceRow" INTEGER NOT NULL,
  "unit" TEXT NOT NULL,
  "unitRaw" TEXT,
  "deviceRaw" TEXT,
  "positionRaw" TEXT,
  "positionCode" TEXT,
  "system" TEXT,
  "content" TEXT NOT NULL,
  "detectedAtRaw" TEXT,
  "reminderRaw" TEXT,
  "sheetStatusRaw" TEXT,
  "sheetStatus" TEXT NOT NULL,
  "repairResultRaw" TEXT,
  "suggestedStatus" TEXT,
  "mismatch" BOOLEAN NOT NULL DEFAULT false,
  "lastReadAt" TIMESTAMP(3) NOT NULL,
  "updatedById" TEXT,
  "updatedByName" TEXT,
  "updatedAt" TIMESTAMP(3),
  CONSTRAINT "DefectUnnumberedRow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DefectUnnumberedRow_identityHash_key" ON "DefectUnnumberedRow"("identityHash");
CREATE INDEX IF NOT EXISTS "DefectUnnumberedRow_source_mismatch_idx" ON "DefectUnnumberedRow"("source", "mismatch");
