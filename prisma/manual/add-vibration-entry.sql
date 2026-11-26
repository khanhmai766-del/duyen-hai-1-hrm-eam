-- Nhập thông số độ rung (chuyển từ VibraControl). Viết IF NOT EXISTS để chạy lại không hỏng.

CREATE TABLE IF NOT EXISTS "VibrationDevice" (
  "id" TEXT NOT NULL,
  "legacyId" TEXT NOT NULL,
  "area" TEXT NOT NULL,
  "system" TEXT NOT NULL DEFAULT '',
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "labels" JSONB NOT NULL,
  "measurementConfig" JSONB NOT NULL DEFAULT '{}',
  "alertConfig" JSONB NOT NULL DEFAULT '{}',
  "machine" JSONB,
  "measureGroups" TEXT[],
  "equipmentSeq" TEXT,
  "mapStatus" TEXT NOT NULL DEFAULT 'none',
  "mapScore" DOUBLE PRECISION,
  "mapNote" TEXT,
  "suggestSeq" TEXT,
  "suggestScore" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VibrationDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VibrationDevice_legacyId_key" ON "VibrationDevice"("legacyId");
CREATE INDEX IF NOT EXISTS "VibrationDevice_area_idx" ON "VibrationDevice"("area");
CREATE INDEX IF NOT EXISTS "VibrationDevice_equipmentSeq_idx" ON "VibrationDevice"("equipmentSeq");

CREATE TABLE IF NOT EXISTS "VibrationRecord" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "date" TEXT,
  "kind" TEXT NOT NULL,
  "shift" TEXT,
  "person" TEXT NOT NULL DEFAULT '',
  "measureTime" TEXT NOT NULL DEFAULT '',
  "power" DOUBLE PRECISION,
  "values" JSONB NOT NULL,
  "millData" JSONB,
  "note" TEXT NOT NULL DEFAULT '',
  "sourceLabel" TEXT NOT NULL DEFAULT '',
  "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "updatedById" TEXT,
  "legacy" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "VibrationRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VibrationRecord_deviceId_date_idx" ON "VibrationRecord"("deviceId", "date");
CREATE INDEX IF NOT EXISTS "VibrationRecord_kind_date_idx" ON "VibrationRecord"("kind", "date");

DO $$ BEGIN
  ALTER TABLE "VibrationRecord" ADD CONSTRAINT "VibrationRecord_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "VibrationDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Bổ sung cho bảng đã tạo từ bản đầu của migration này.
ALTER TABLE "VibrationDevice" ADD COLUMN IF NOT EXISTS "suggestSeq" TEXT;
ALTER TABLE "VibrationDevice" ADD COLUMN IF NOT EXISTS "suggestScore" DOUBLE PRECISION;
