-- Bổ sung dữ liệu phiếu giấy và metadata tệp; không sửa dữ liệu phiếu hiện hữu.
ALTER TABLE "WorkPermit"
  ADD COLUMN IF NOT EXISTS "managingUnit" TEXT NOT NULL DEFAULT 'Phân xưởng Vận hành 1',
  ADD COLUMN IF NOT EXISTS "plantName" TEXT NOT NULL DEFAULT 'Duyên Hải 1',
  ADD COLUMN IF NOT EXISTS "equipmentItems" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS "WorkPermitAttachment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "permitId" TEXT NOT NULL,
  "s3Key" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkPermitAttachment_s3Key_key" ON "WorkPermitAttachment"("s3Key");
CREATE INDEX IF NOT EXISTS "WorkPermitAttachment_permitId_createdAt_idx" ON "WorkPermitAttachment"("permitId", "createdAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkPermitAttachment_permitId_fkey') THEN
    ALTER TABLE "WorkPermitAttachment" ADD CONSTRAINT "WorkPermitAttachment_permitId_fkey"
      FOREIGN KEY ("permitId") REFERENCES "WorkPermit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
