-- Tầng 1 — Chuẩn hóa khóa liên kết: Defect.deviceSeq → EquipmentNode.seq (FK + index).
-- Idempotent: chạy lại nhiều lần an toàn. Áp bằng:
--   npx prisma db execute --file scripts/sql/defect-deviceseq-tang1.sql --schema prisma/schema.prisma

-- 1) Thêm cột khóa chuẩn (giữ cột "device" cũ để tương thích).
ALTER TABLE "Defect" ADD COLUMN IF NOT EXISTS "deviceSeq" TEXT;

-- 2) Backfill lượt 1: "device" đã là seq hợp lệ trong cây (form chọn từ cây nên đa số rơi vào đây).
UPDATE "Defect" d
SET "deviceSeq" = d."device"
FROM "EquipmentNode" e
WHERE d."deviceSeq" IS NULL AND d."device" = e."seq";

-- 3) Backfill lượt 2: "device" khớp mã thiết bị (code) DUY NHẤT trong cây.
--    Code trùng giữa nhiều node thì bỏ qua (không đoán mò).
UPDATE "Defect" d
SET "deviceSeq" = m."seq"
FROM (
  SELECT "code", MIN("seq") AS "seq"
  FROM "EquipmentNode"
  GROUP BY "code"
  HAVING COUNT(*) = 1
) m
WHERE d."deviceSeq" IS NULL AND d."device" = m."code";

-- 4) FK: xóa node → SET NULL (không kéo sập phiếu); đổi seq → cascade theo.
--    Tên constraint theo chuẩn Prisma để migrate diff không báo lệch.
ALTER TABLE "Defect" DROP CONSTRAINT IF EXISTS "Defect_deviceSeq_fkey";
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_deviceSeq_fkey"
  FOREIGN KEY ("deviceSeq") REFERENCES "EquipmentNode"("seq")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5) Index thường + index còn thiếu theo schema.
CREATE INDEX IF NOT EXISTS "Defect_deviceSeq_idx" ON "Defect"("deviceSeq");
CREATE INDEX IF NOT EXISTS "Defect_detectedAt_idx" ON "Defect"("detectedAt");

-- 6) Index prefix (text_pattern_ops) cho truy vấn cả nhánh cây LIKE 'x.%'.
CREATE INDEX IF NOT EXISTS "defect_deviceseq_prefix" ON "Defect"("deviceSeq" text_pattern_ops);
CREATE INDEX IF NOT EXISTS "repairlog_deviceseq_prefix" ON "RepairLog"("deviceSeq" text_pattern_ops);
CREATE INDEX IF NOT EXISTS "matrep_deviceseq_prefix" ON "MaterialReplacement"("deviceSeq" text_pattern_ops);
