-- Cột phục vụ NHẬP LƯU TRỮ lịch sử sử dụng vật tư từ Google Sheet theo dõi vật tư.
-- Additive hoàn toàn: mọi cột đều nullable, không đụng dữ liệu và luồng ghi nhận đang chạy.
-- Áp bằng: npx prisma db execute --file prisma/manual/add-replacement-log-import-columns.sql --schema prisma/schema.prisma

ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "importSource"      TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "importKey"         TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "pctNumber"         TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "sourceNote"        TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "materialCategory"  TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "materialNameLabel" TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "doneByName"        TEXT;

-- Chạy lại script nhập không được tạo bản sao. Chỉ ràng buộc trên dòng CÓ nguồn nhập;
-- dòng do web tự sinh có importSource = NULL nên PostgreSQL bỏ qua (NULL không đụng UNIQUE).
CREATE UNIQUE INDEX IF NOT EXISTS "MaterialReplacementLog_importSource_importKey_key"
  ON "MaterialReplacementLog" ("importSource", "importKey");

-- Tab Lịch sử thay thế lọc/sắp theo nguồn + ngày.
CREATE INDEX IF NOT EXISTS "MaterialReplacementLog_importSource_replacedAt_idx"
  ON "MaterialReplacementLog" ("importSource", "replacedAt" DESC);
