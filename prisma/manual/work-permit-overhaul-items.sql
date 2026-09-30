-- Hạng mục đại tu đồng bộ từ Google Sheets tiến độ đại tu + ảnh chụp hạng mục trên PCT nhà thầu · Đại tu.
-- Không phá dữ liệu: chỉ tạo bảng mới và thêm một cột null. Chạy lại nhiều lần vẫn an toàn.
CREATE TABLE IF NOT EXISTS "WorkPermitOverhaulItem" (
  "id"             TEXT         NOT NULL,
  "source"         TEXT         NOT NULL,
  "sheet"          TEXT         NOT NULL,
  "sheetRow"       INTEGER      NOT NULL DEFAULT 0,
  "kind"           TEXT         NOT NULL,
  "positionTitle"  TEXT         NOT NULL DEFAULT '',
  "positionCode"   TEXT         NOT NULL DEFAULT '',
  "code"           TEXT         NOT NULL,
  "device"         TEXT         NOT NULL DEFAULT '',
  "content"        TEXT         NOT NULL DEFAULT '',
  "method"         TEXT         NOT NULL DEFAULT '',
  "contractorCode" TEXT         NOT NULL DEFAULT '',
  "contractor"     TEXT         NOT NULL DEFAULT '',
  "percent"        TEXT         NOT NULL DEFAULT '',
  "status"         TEXT         NOT NULL DEFAULT '',
  "isActive"       BOOLEAN      NOT NULL DEFAULT true,
  "syncedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkPermitOverhaulItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkPermitOverhaulItem_source_sheet_code_key" ON "WorkPermitOverhaulItem"("source", "sheet", "code");
CREATE INDEX IF NOT EXISTS "WorkPermitOverhaulItem_kind_contractorCode_positionCode_idx" ON "WorkPermitOverhaulItem"("kind", "contractorCode", "positionCode");

ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "overhaulItems" JSONB;
