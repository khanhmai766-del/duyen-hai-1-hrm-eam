-- Tạo riêng các bảng kiểm tra tiếp địa & chống sét, không dùng `db push` để tránh
-- tác động các bảng ngoài schema đang tồn tại ở một số môi trường.
CREATE TABLE IF NOT EXISTS "grounding_lightning_items" (
  "id" TEXT NOT NULL,
  "stt" DOUBLE PRECISION,
  "areaEquipment" TEXT NOT NULL,
  "position" TEXT,
  "positionCode" TEXT,
  "machine" TEXT NOT NULL DEFAULT 'COMMON',
  "note" TEXT,
  "sourceKey" TEXT,
  "sourceSheet" TEXT,
  "sourceRow" INTEGER,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "grounding_lightning_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "grounding_lightning_items_sourceKey_key" ON "grounding_lightning_items"("sourceKey");
CREATE INDEX IF NOT EXISTS "grounding_lightning_items_positionCode_machine_idx" ON "grounding_lightning_items"("positionCode", "machine");
CREATE INDEX IF NOT EXISTS "grounding_lightning_items_areaEquipment_idx" ON "grounding_lightning_items"("areaEquipment");

CREATE TABLE IF NOT EXISTS "grounding_lightning_points" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'UNCHECKED',
  "defectDescription" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "grounding_lightning_points_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "grounding_lightning_points_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "grounding_lightning_items"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "grounding_lightning_points_itemId_type_key" ON "grounding_lightning_points"("itemId", "type");
CREATE INDEX IF NOT EXISTS "grounding_lightning_points_type_status_idx" ON "grounding_lightning_points"("type", "status");

CREATE TABLE IF NOT EXISTS "grounding_lightning_attachments" (
  "id" TEXT NOT NULL,
  "pointId" TEXT NOT NULL,
  "s3Key" TEXT NOT NULL,
  "originalName" TEXT,
  "mimeType" TEXT,
  "bytes" INTEGER,
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "grounding_lightning_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "grounding_lightning_attachments_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "grounding_lightning_points"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "grounding_lightning_attachments_s3Key_key" ON "grounding_lightning_attachments"("s3Key");
CREATE INDEX IF NOT EXISTS "grounding_lightning_attachments_pointId_idx" ON "grounding_lightning_attachments"("pointId");

CREATE TABLE IF NOT EXISTS "grounding_lightning_inspections" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "note" TEXT,
  "inspectedById" TEXT NOT NULL,
  "inspectorName" TEXT NOT NULL,
  "inspectorPosition" TEXT,
  "signatureKey" TEXT NOT NULL,
  "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "grounding_lightning_inspections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "grounding_lightning_inspections_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "grounding_lightning_items"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "grounding_lightning_inspections_itemId_signedAt_idx" ON "grounding_lightning_inspections"("itemId", "signedAt");
CREATE INDEX IF NOT EXISTS "grounding_lightning_inspections_inspectedById_idx" ON "grounding_lightning_inspections"("inspectedById");

CREATE TABLE IF NOT EXISTS "grounding_lightning_inspection_results" (
  "id" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "defectDescription" TEXT,
  "imageKeys" TEXT[] NOT NULL,
  CONSTRAINT "grounding_lightning_inspection_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "grounding_lightning_inspection_results_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "grounding_lightning_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "grounding_lightning_inspection_results_inspectionId_type_key" ON "grounding_lightning_inspection_results"("inspectionId", "type");
