-- Lô tồn kho theo số phiếu giao hàng + phân bổ khi sử dụng (FIFO).
-- Material.quantity giữ lại làm tổng các lô còn lại nên không đụng tới cột đó.
CREATE TABLE IF NOT EXISTS "MaterialStockLot" (
  "id"           TEXT PRIMARY KEY,
  "materialCode" TEXT NOT NULL,
  "stockUnit"    TEXT NOT NULL DEFAULT 'COMMON',
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
ALTER TABLE "MaterialStockLot" ADD COLUMN IF NOT EXISTS "stockUnit" TEXT NOT NULL DEFAULT 'COMMON';

-- Lô chai khí cũ có liên kết phiếu: phục hồi đúng tổ máy từ phiếu. Lô tồn đầu kỳ không
-- có căn cứ phân bổ nên giữ COMMON để không tự ý làm sai số liệu vận hành.
UPDATE "MaterialStockLot" lot
SET "stockUnit" = ticket."unit"
FROM "MaterialTicket" ticket
WHERE lot."ticketId" = ticket."id"
  AND (
    ticket."materialCategory" = 'Chai khí'
    OR EXISTS (
      SELECT 1 FROM "Material" material
      WHERE material."code" = lot."materialCode"
        AND material."category" IN ('Chai Khí', 'Chai khí')
    )
  )
  AND lot."stockUnit" = 'COMMON';

UPDATE "MaterialStockLot" lot
SET "stockUnit" = material."machine"
FROM "Material" material
WHERE lot."materialCode" = material."code"
  AND material."category" IN ('Chai Khí', 'Chai khí')
  AND lot."stockUnit" = 'COMMON'
  AND (
    SELECT COUNT(DISTINCT candidate."machine")
    FROM "Material" candidate
    WHERE candidate."code" = lot."materialCode"
      AND candidate."category" IN ('Chai Khí', 'Chai khí')
  ) = 1;

DROP INDEX IF EXISTS "MaterialStockLot_materialCode_quantityLeft_idx";
CREATE INDEX IF NOT EXISTS "MaterialStockLot_materialCode_stockUnit_quantityLeft_idx" ON "MaterialStockLot"("materialCode", "stockUnit", "quantityLeft");

UPDATE "Material" material
SET "quantity" = COALESCE((
  SELECT SUM(lot."quantityLeft")::INTEGER
  FROM "MaterialStockLot" lot
  WHERE lot."materialCode" = material."code"
    AND lot."stockUnit" = material."machine"
), 0)
WHERE material."category" IN ('Chai Khí', 'Chai khí');
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
