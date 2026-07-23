-- =====================================================================
-- ĐỒNG BỘ SCHEMA CÂY THIẾT BỊ + PHƯƠNG ÁN S2 (chỉ THÊM, an toàn chạy lại)
-- Chạy trên production TRƯỚC khi deploy code cây thiết bị mới:
--   npx prisma db execute --file prisma/manual/sync-equipment-tree-s2.sql --schema prisma/schema.prisma
-- TUYỆT ĐỐI KHÔNG dùng `prisma db push` trên production.
-- =====================================================================

-- EquipmentNode: re-key (seq = Mã thiết bị đầy đủ) + lazy-load + tìm không dấu
ALTER TABLE "EquipmentNode" ADD COLUMN IF NOT EXISTS "childCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EquipmentNode" ADD COLUMN IF NOT EXISTS "searchText" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EquipmentNode" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "EquipmentNode_externalId_key" ON "EquipmentNode" ("externalId");
CREATE INDEX IF NOT EXISTS "EquipmentNode_kks_idx" ON "EquipmentNode" ("kks");
CREATE INDEX IF NOT EXISTS "EquipmentNode_name_idx" ON "EquipmentNode" ("name");

-- Hồ sơ theo tổ máy (bảng THƯA — chỉ có dòng khi "Tạo hồ sơ S2" / override)
CREATE TABLE IF NOT EXISTS "EquipmentProfile" (
  id TEXT PRIMARY KEY,
  "nodeSeq" TEXT NOT NULL,
  machine TEXT NOT NULL,
  kks TEXT,
  name TEXT,
  "attachedInfo" TEXT,
  "documentUrl" TEXT,
  "imageUrl" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipmentProfile_nodeSeq_fkey" FOREIGN KEY ("nodeSeq") REFERENCES "EquipmentNode"("seq") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "EquipmentProfile_nodeSeq_machine_key" ON "EquipmentProfile"("nodeSeq","machine");
CREATE INDEX IF NOT EXISTS "EquipmentProfile_machine_idx" ON "EquipmentProfile"("machine");

-- Phân tổ máy cho dữ liệu nghiệp vụ trên cây dùng chung (Defect/DefectHistory đã có "unit";
-- RepairLog đã có "machine" từ trước)
ALTER TABLE "EquipmentMaterial" ADD COLUMN IF NOT EXISTS "machine" TEXT NOT NULL DEFAULT 'COMMON';
ALTER TABLE "MaterialReplacement" ADD COLUMN IF NOT EXISTS "machine" TEXT NOT NULL DEFAULT 'COMMON';
ALTER TABLE "DeviceQrCard" ADD COLUMN IF NOT EXISTS "machine" TEXT NOT NULL DEFAULT 'COMMON';

-- Thẻ QR: mỗi tổ máy 1 thẻ trên cùng nút (bỏ unique cũ theo deviceSeq)
ALTER TABLE "DeviceQrCard" DROP CONSTRAINT IF EXISTS "DeviceQrCard_deviceSeq_key";
DROP INDEX IF EXISTS "DeviceQrCard_deviceSeq_key";
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceQrCard_deviceSeq_machine_key" ON "DeviceQrCard"("deviceSeq","machine");
