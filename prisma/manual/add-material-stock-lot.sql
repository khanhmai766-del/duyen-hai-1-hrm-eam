-- Lô tồn kho theo số phiếu giao hàng + phân bổ khi sử dụng (FIFO).
-- Material.quantity giữ lại làm tổng các lô còn lại nên không đụng tới cột đó.
CREATE TABLE IF NOT EXISTS "MaterialStockLot" (
  "id"           TEXT PRIMARY KEY,
  "materialCode" TEXT NOT NULL,
  "deliveryNote" TEXT,
  "erpCode"      TEXT,
  "receivedAt"   TIMESTAMP(3),
  "quantityIn"   INTEGER NOT NULL,
  "quantityLeft" INTEGER NOT NULL,
  "ticketId"     TEXT,
  "note"         TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "MaterialStockLot_materialCode_quantityLeft_idx" ON "MaterialStockLot"("materialCode", "quantityLeft");
CREATE INDEX IF NOT EXISTS "MaterialStockLot_ticketId_idx" ON "MaterialStockLot"("ticketId");

CREATE TABLE IF NOT EXISTS "MaterialLotUsage" (
  "id"        TEXT PRIMARY KEY,
  "lotId"     TEXT NOT NULL REFERENCES "MaterialStockLot"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "ticketId"  TEXT NOT NULL,
  "quantity"  INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "MaterialLotUsage_ticketId_idx" ON "MaterialLotUsage"("ticketId");
CREATE INDEX IF NOT EXISTS "MaterialLotUsage_lotId_idx" ON "MaterialLotUsage"("lotId");
