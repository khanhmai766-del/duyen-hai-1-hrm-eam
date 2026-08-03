-- Lịch sử thay thế phải sống độc lập với vòng đời điểm theo dõi.
-- 1) Nới FK replacementId: NOT NULL + Cascade  ->  nullable + SET NULL
-- 2) Thêm cột snapshot đủ để hiển thị khi điểm đã bị gỡ/xoá
-- 3) Ghi nguồn gốc (SYC thay thế vật tư) lên chính dòng lịch sử
-- Toàn bộ additive/nới lỏng: không xoá cột, không đổi kiểu dữ liệu.

ALTER TABLE "MaterialReplacementLog" ALTER COLUMN "replacementId" DROP NOT NULL;

ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "materialId" TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "deviceSeq" TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "machine" TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "systemLabel" TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "deviceLabel" TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "managingPosition" TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "intervalMonths" INTEGER;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "intervalNote" TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "unitLabel" TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "defectId" TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "requestNumber" TEXT;

-- Đổi hành vi xoá của FK cũ: Cascade sẽ XOÁ MẤT lịch sử khi điểm bị xoá.
ALTER TABLE "MaterialReplacementLog" DROP CONSTRAINT IF EXISTS "MaterialReplacementLog_replacementId_fkey";
ALTER TABLE "MaterialReplacementLog" ADD CONSTRAINT "MaterialReplacementLog_replacementId_fkey"
  FOREIGN KEY ("replacementId") REFERENCES "MaterialReplacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$ BEGIN
  ALTER TABLE "MaterialReplacementLog" ADD CONSTRAINT "MaterialReplacementLog_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "MaterialReplacementLog_deviceSeq_replacedAt_idx"
  ON "MaterialReplacementLog"("deviceSeq", "replacedAt" DESC);
CREATE INDEX IF NOT EXISTS "MaterialReplacementLog_materialId_idx"
  ON "MaterialReplacementLog"("materialId");
CREATE INDEX IF NOT EXISTS "MaterialReplacementLog_defectId_idx"
  ON "MaterialReplacementLog"("defectId");

-- Backfill snapshot cho các dòng lịch sử đã có (nếu có) từ điểm còn liên kết.
UPDATE "MaterialReplacementLog" l
SET "materialId"       = COALESCE(l."materialId", r."materialId"),
    "deviceSeq"        = COALESCE(l."deviceSeq", r."deviceSeq"),
    "machine"          = COALESCE(l."machine", r."machine"),
    "systemLabel"      = COALESCE(l."systemLabel", r."system"),
    "deviceLabel"      = COALESCE(l."deviceLabel", n."name", r."location"),
    "managingPosition" = COALESCE(l."managingPosition", r."managingPosition"),
    "intervalMonths"   = COALESCE(l."intervalMonths", r."intervalMonths"),
    "intervalNote"     = COALESCE(l."intervalNote", r."intervalNote"),
    "unitLabel"        = COALESCE(l."unitLabel", m."unit")
FROM "MaterialReplacement" r
LEFT JOIN "EquipmentNode" n ON n."seq" = r."deviceSeq"
LEFT JOIN "Material" m ON m."id" = r."materialId"
WHERE l."replacementId" = r."id" AND l."materialId" IS NULL;
