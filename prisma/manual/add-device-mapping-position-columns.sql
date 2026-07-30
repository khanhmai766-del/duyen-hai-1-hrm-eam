-- Đồng bộ an toàn các cột ánh xạ/cương vị còn thiếu trên DB cục bộ cũ.
-- Chỉ bổ sung cột và chỉ mục; không xóa hoặc thay đổi dữ liệu hiện có.
ALTER TABLE "Defect"
  ADD COLUMN IF NOT EXISTS "mappedDeviceUnit" TEXT,
  ADD COLUMN IF NOT EXISTS "positionCode" TEXT;

ALTER TABLE "DefectHistory"
  ADD COLUMN IF NOT EXISTS "mappedDeviceUnit" TEXT;

ALTER TABLE "DefectRelatedDevice"
  ADD COLUMN IF NOT EXISTS "mappedUnit" TEXT;

ALTER TABLE "DefectHistoryRelatedDevice"
  ADD COLUMN IF NOT EXISTS "mappedUnit" TEXT;

ALTER TABLE "MaterialReplacement"
  ADD COLUMN IF NOT EXISTS "managingPositionCode" TEXT;

ALTER TABLE "PositionSystemScope"
  ADD COLUMN IF NOT EXISTS "positionCode" TEXT;

CREATE INDEX IF NOT EXISTS "Defect_positionCode_idx"
  ON "Defect"("positionCode");

CREATE INDEX IF NOT EXISTS "MaterialReplacement_managingPositionCode_idx"
  ON "MaterialReplacement"("managingPositionCode");

CREATE INDEX IF NOT EXISTS "PositionSystemScope_positionCode_idx"
  ON "PositionSystemScope"("positionCode");
