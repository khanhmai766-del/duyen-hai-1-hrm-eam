-- Giai đoạn 5 · Mạch vòng kín vật tư
-- Nhu cầu vật tư theo tháng — cột H và cột J của biểu QLVT.20.
-- Additive: không xoá, không đổi kiểu, không chạm dữ liệu hiện có.
--   npx prisma db execute --file prisma/manual/add-material-monthly-request.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "MaterialMonthlyRequest" (
  "id"                TEXT NOT NULL,
  "periodKey"         TEXT NOT NULL,
  "materialCategory"  TEXT NOT NULL,
  "materialNameKey"   TEXT NOT NULL,
  "materialNameLabel" TEXT NOT NULL,
  "erpCode"           TEXT,
  "unitLabel"         TEXT NOT NULL,
  "purpose"           TEXT NOT NULL,
  "quantity"          DECIMAL(18,4) NOT NULL,
  "proposerName"      TEXT,
  "note"              TEXT,
  "createdById"       TEXT NOT NULL,
  "createdByName"     TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaterialMonthlyRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MaterialMonthlyRequest_periodKey_materialCategory_idx"
  ON "MaterialMonthlyRequest" ("periodKey", "materialCategory");
CREATE INDEX IF NOT EXISTS "MaterialMonthlyRequest_materialCategory_materialNameKey_idx"
  ON "MaterialMonthlyRequest" ("materialCategory", "materialNameKey");
