-- Gom nhóm vật tư dầu: enum MappingStatus + oil_types + oil_type_mapping_logs
-- + các cột mapping trên bảng "ErpMaterial" có sẵn (từ scripts/sql/erp-materials-upgrade.sql).
-- Chạy SAU scripts/sql/erp-materials-upgrade.sql. Idempotent — chạy lại nhiều lần không sao.
-- Áp dụng bằng: npx prisma db execute --file prisma/add_oil_grouping.sql --schema prisma/schema.prisma
-- (không dùng db:push để tránh drop các bảng ngoài schema — xem CLAUDE.md)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MappingStatus') THEN
    CREATE TYPE "MappingStatus" AS ENUM ('UNMAPPED', 'SUGGESTED', 'CONFIRMED', 'IGNORED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "oil_types" (
  "id"        TEXT NOT NULL,
  "code"      TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "baseUnit"  TEXT NOT NULL,
  "minStock"  DOUBLE PRECISION,
  "note"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oil_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "oil_types_code_key" ON "oil_types"("code");

-- Cột mapping trên bảng vật tư ERP có sẵn. Import Excel chỉ update
-- name/unit/category/erpStock nên các cột này không bị reset sau mỗi lần nhập.
ALTER TABLE "ErpMaterial"
  ADD COLUMN IF NOT EXISTS "oilTypeId" TEXT,
  ADD COLUMN IF NOT EXISTS "mappingStatus" "MappingStatus" NOT NULL DEFAULT 'UNMAPPED',
  ADD COLUMN IF NOT EXISTS "conversionFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "suggestedOilTypeId" TEXT,
  ADD COLUMN IF NOT EXISTS "suggestedScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "suggestedReason" TEXT;

CREATE INDEX IF NOT EXISTS "ErpMaterial_mappingStatus_idx" ON "ErpMaterial"("mappingStatus");
CREATE INDEX IF NOT EXISTS "ErpMaterial_oilTypeId_idx" ON "ErpMaterial"("oilTypeId");

CREATE TABLE IF NOT EXISTS "oil_type_mapping_logs" (
  "id"         TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "oilTypeId"  TEXT,
  "action"     TEXT NOT NULL,
  "score"      DOUBLE PRECISION,
  "reason"     TEXT,
  "userId"     TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oil_type_mapping_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "oil_type_mapping_logs_materialId_idx" ON "oil_type_mapping_logs"("materialId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ErpMaterial_oilTypeId_fkey') THEN
    ALTER TABLE "ErpMaterial"
      ADD CONSTRAINT "ErpMaterial_oilTypeId_fkey"
      FOREIGN KEY ("oilTypeId") REFERENCES "oil_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oil_type_mapping_logs_materialId_fkey') THEN
    ALTER TABLE "oil_type_mapping_logs"
      ADD CONSTRAINT "oil_type_mapping_logs_materialId_fkey"
      FOREIGN KEY ("materialId") REFERENCES "ErpMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oil_type_mapping_logs_oilTypeId_fkey') THEN
    ALTER TABLE "oil_type_mapping_logs"
      ADD CONSTRAINT "oil_type_mapping_logs_oilTypeId_fkey"
      FOREIGN KEY ("oilTypeId") REFERENCES "oil_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
