-- Module "Tồn kho hóa chất" — 6 bảng mới. Đặc tả: docs/ton-kho-hoa-chat-spec.md
--
-- CHỈ THÊM, không có lệnh xoá nào. `prisma db push` KHÔNG dùng được cho repo này
-- (DB dev/prod có bảng ngoài schema, db push đòi drop), và `migrate deploy` cũng không
-- (prod chưa baseline → P3005). Áp bằng:
--   npx prisma db execute --file prisma/manual/add-chemical-inventory.sql --schema prisma/schema.prisma
--
-- Đây là nhóm bảng đầu tiên của repo dùng DECIMAL — khối lượng hóa chất có 3 số lẻ và
-- phải đối soát với hợp đồng, dùng DOUBLE PRECISION là sai số tích lũy.

-- ---------------------------------------------------------------------------
-- Danh mục mặt hàng: 6 hóa chất + 5 bồn HFO + 5 dòng dầu Diesel/DO
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ChemicalInventoryItem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "concentration" TEXT,
    "itemType" TEXT NOT NULL,
    "baseUnit" TEXT NOT NULL,
    "displayUnit" TEXT,
    "trackingMode" TEXT NOT NULL DEFAULT 'MONTHLY',
    "sheetRow" INTEGER,
    "receiptSheet" TEXT,
    "materialCode" TEXT,
    "tankCapacity" DECIMAL(18,4),
    "lowStockThreshold" DECIMAL(18,4),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChemicalInventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChemicalInventoryItem_code_key"
    ON "ChemicalInventoryItem"("code");
CREATE INDEX IF NOT EXISTS "ChemicalInventoryItem_itemType_sortOrder_idx"
    ON "ChemicalInventoryItem"("itemType", "sortOrder");

-- ---------------------------------------------------------------------------
-- Kỳ nhập liệu theo tháng
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ChemicalInventoryPeriod" (
    "id" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "generationMwh" DECIMAL(18,3),
    "lockedAt" TIMESTAMP(3),
    "lockedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChemicalInventoryPeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChemicalInventoryPeriod_periodKey_key"
    ON "ChemicalInventoryPeriod"("periodKey");
CREATE INDEX IF NOT EXISTS "ChemicalInventoryPeriod_status_idx"
    ON "ChemicalInventoryPeriod"("status");

-- ---------------------------------------------------------------------------
-- Bản đọc tồn — dùng chung cho lưới tháng (MONTH_END) và nhật ký ngày (DAILY)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ChemicalStockReading" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "positionCode" TEXT NOT NULL,
    "readDate" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "quantity" DECIMAL(18,4),
    "rawText" TEXT,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChemicalStockReading_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChemicalStockReading_itemId_positionCode_readDate_kind_key"
    ON "ChemicalStockReading"("itemId", "positionCode", "readDate", "kind");
CREATE INDEX IF NOT EXISTS "ChemicalStockReading_periodKey_kind_itemId_idx"
    ON "ChemicalStockReading"("periodKey", "kind", "itemId");
CREATE INDEX IF NOT EXISTS "ChemicalStockReading_itemId_readDate_idx"
    ON "ChemicalStockReading"("itemId", "readDate");
CREATE INDEX IF NOT EXISTS "ChemicalStockReading_periodId_idx"
    ON "ChemicalStockReading"("periodId");

-- ---------------------------------------------------------------------------
-- Chuyến xe hóa chất về nhà máy
--
-- Khóa duy nhất (itemId, receivedAt, vehicleNumber) là thứ CHẶN CỘNG ĐÔI khi cùng
-- một chuyến xe được ghi từ hai cửa: bước lãnh của phiếu vật tư và nhật ký ngày.
-- Đã kiểm dữ liệu thật: trong cùng một ngày các biển số luôn khác nhau.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ChemicalReceipt" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "receivedAt" DATE NOT NULL,
    "periodKey" TEXT NOT NULL,
    "vehicleNumber" TEXT,
    "plantWeight" DECIMAL(18,4),
    "contractorWeight" DECIMAL(18,4),
    "acceptedWeight" DECIMAL(18,4) NOT NULL,
    "receivingPosition" TEXT,
    "receivingPositionRaw" TEXT,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "sourceKey" TEXT,
    "materialTicketId" TEXT,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChemicalReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChemicalReceipt_sourceKey_key"
    ON "ChemicalReceipt"("sourceKey");
CREATE UNIQUE INDEX IF NOT EXISTS "ChemicalReceipt_itemId_receivedAt_vehicleNumber_key"
    ON "ChemicalReceipt"("itemId", "receivedAt", "vehicleNumber");
CREATE INDEX IF NOT EXISTS "ChemicalReceipt_periodKey_itemId_idx"
    ON "ChemicalReceipt"("periodKey", "itemId");
CREATE INDEX IF NOT EXISTS "ChemicalReceipt_itemId_receivedAt_idx"
    ON "ChemicalReceipt"("itemId", "receivedAt");
CREATE INDEX IF NOT EXISTS "ChemicalReceipt_materialTicketId_idx"
    ON "ChemicalReceipt"("materialTicketId");

-- ---------------------------------------------------------------------------
-- Hợp đồng cung cấp theo năm.
-- Không có cột "đã nhận": cột đó trong sheet gốc bị trộn lẫn lượng sử dụng từ
-- tháng 9 trở đi. Backend luôn cộng lại từ ChemicalReceipt.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ChemicalContract" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "materialCode" TEXT,
    "supplier" TEXT,
    "origin" TEXT,
    "contractQuantity" DECIMAL(18,4) NOT NULL,
    "forecastDemand" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChemicalContract_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChemicalContract_year_itemId_key"
    ON "ChemicalContract"("year", "itemId");
CREATE INDEX IF NOT EXISTS "ChemicalContract_year_idx"
    ON "ChemicalContract"("year");

-- ---------------------------------------------------------------------------
-- Lịch sử import workbook
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ChemicalImportBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "detail" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChemicalImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChemicalImportBatch_createdAt_idx"
    ON "ChemicalImportBatch"("createdAt");

-- ---------------------------------------------------------------------------
-- Khóa ngoại. Postgres không có ADD CONSTRAINT IF NOT EXISTS nên bọc DO block
-- để chạy lại file nhiều lần vẫn an toàn.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChemicalStockReading_periodId_fkey') THEN
        ALTER TABLE "ChemicalStockReading"
            ADD CONSTRAINT "ChemicalStockReading_periodId_fkey"
            FOREIGN KEY ("periodId") REFERENCES "ChemicalInventoryPeriod"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChemicalStockReading_itemId_fkey') THEN
        ALTER TABLE "ChemicalStockReading"
            ADD CONSTRAINT "ChemicalStockReading_itemId_fkey"
            FOREIGN KEY ("itemId") REFERENCES "ChemicalInventoryItem"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChemicalReceipt_itemId_fkey') THEN
        ALTER TABLE "ChemicalReceipt"
            ADD CONSTRAINT "ChemicalReceipt_itemId_fkey"
            FOREIGN KEY ("itemId") REFERENCES "ChemicalInventoryItem"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChemicalContract_itemId_fkey') THEN
        ALTER TABLE "ChemicalContract"
            ADD CONSTRAINT "ChemicalContract_itemId_fkey"
            FOREIGN KEY ("itemId") REFERENCES "ChemicalInventoryItem"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Bổ sung 2026-08-20: nguyên văn ô "Xe" trong sổ Excel.
-- Cũng là biển số nhưng thường GHI TẮT (chỉ vài chữ số cuối như 478, 269, 504),
-- trong khi nhật ký ghi đủ ("51C-214.77"). Tách khỏi "vehicleNumber" để giữ được
-- bản gốc mà vẫn chuẩn hóa được biển số dùng làm khóa chống trùng.
-- ---------------------------------------------------------------------------
ALTER TABLE "ChemicalReceipt" ADD COLUMN IF NOT EXISTS "vehicleRef" TEXT;

-- ---------------------------------------------------------------------------
-- Bổ sung 2026-08-21 (pha 5): nối phiếu vật tư với sổ hóa chất.
-- Chỉ giữ con trỏ sang ChemicalReceipt — ngày nhập, biển số và hai số cân của từng
-- chuyến xe chỉ tồn tại một chỗ duy nhất bên sổ hóa chất, không nhân bản sang đây.
-- ---------------------------------------------------------------------------
ALTER TABLE "MaterialTicket"
  ADD COLUMN IF NOT EXISTS "chemicalReceiptIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- ---------------------------------------------------------------------------
-- Bổ sung 2026-08-21: cương vị NHẬN hàng mặc định của từng mặt hàng.
-- Điền sẵn khi tạo phiếu nhập để VHV khỏi phải chọn lại mỗi lần. Khác với cương vị
-- GIỮ TỒN trên lưới tháng: HCl giữ ở ba nơi nhưng luôn do Máy phó nhận rồi mới phân về.
-- ---------------------------------------------------------------------------
ALTER TABLE "ChemicalInventoryItem" ADD COLUMN IF NOT EXISTS "defaultPosition" TEXT;
