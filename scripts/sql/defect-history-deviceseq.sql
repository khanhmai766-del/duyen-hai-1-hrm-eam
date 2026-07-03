-- Phân quyền theo cương vị (mở rộng Tầng 1): DefectHistory.deviceSeq → EquipmentNode.seq.
-- Cho phép lọc quyền/nhánh cây bằng SQL trên bảng lịch sử khiếm khuyết.
-- Idempotent: chạy lại nhiều lần an toàn. Áp bằng:
--   npx prisma db execute --file scripts/sql/defect-history-deviceseq.sql --schema prisma/schema.prisma

-- 1) Thêm cột khóa chuẩn (giữ cột "device" cũ làm snapshot text).
ALTER TABLE "DefectHistory" ADD COLUMN IF NOT EXISTS "deviceSeq" TEXT;

-- 2) Backfill lượt 1: "device" đã là seq hợp lệ trong cây.
UPDATE "DefectHistory" d
SET "deviceSeq" = d."device"
FROM "EquipmentNode" e
WHERE d."deviceSeq" IS NULL AND d."device" = e."seq";

-- 3) Backfill lượt 2: "device" khớp mã thiết bị (code) DUY NHẤT trong cây.
UPDATE "DefectHistory" d
SET "deviceSeq" = m."seq"
FROM (
  SELECT "code", MIN("seq") AS "seq"
  FROM "EquipmentNode"
  GROUP BY "code"
  HAVING COUNT(*) = 1
) m
WHERE d."deviceSeq" IS NULL AND d."device" = m."code";

-- 4) FK: xóa node → SET NULL (lịch sử sống độc lập, snapshot text vẫn còn);
--    đổi seq → cascade theo. Tên constraint theo chuẩn Prisma.
ALTER TABLE "DefectHistory" DROP CONSTRAINT IF EXISTS "DefectHistory_deviceSeq_fkey";
ALTER TABLE "DefectHistory" ADD CONSTRAINT "DefectHistory_deviceSeq_fkey"
  FOREIGN KEY ("deviceSeq") REFERENCES "EquipmentNode"("seq")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5) Index: thường + kép thời gian + prefix nhánh cây.
CREATE INDEX IF NOT EXISTS "DefectHistory_deviceSeq_idx" ON "DefectHistory"("deviceSeq");
CREATE INDEX IF NOT EXISTS "DefectHistory_deviceSeq_performedAt_idx" ON "DefectHistory"("deviceSeq", "performedAt" DESC);
CREATE INDEX IF NOT EXISTS "defecthistory_deviceseq_prefix" ON "DefectHistory"("deviceSeq" text_pattern_ops);
