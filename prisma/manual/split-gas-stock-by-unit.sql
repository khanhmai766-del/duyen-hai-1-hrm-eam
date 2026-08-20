-- Tách tồn Chai khí theo mã vật tư + tổ máy, đồng thời lưu mã ERP thật trên lịch sử kho.
-- Migration cộng thêm, có thể chạy lại; không xóa lô, phiếu, vật tư hoặc liên kết thiết bị.

ALTER TABLE "MaterialStockLot"
  ADD COLUMN IF NOT EXISTS "stockUnit" TEXT NOT NULL DEFAULT 'COMMON';

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

-- Lô tồn đầu kỳ không có phiếu nhưng mã chỉ tồn tại ở đúng một tổ máy thì vẫn xác định
-- được chắc chắn phạm vi. Mã có nhiều dòng S1/S2/COMMON giữ COMMON để chờ đối chiếu thủ công.
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
CREATE INDEX IF NOT EXISTS "MaterialStockLot_materialCode_stockUnit_quantityLeft_idx"
  ON "MaterialStockLot"("materialCode", "stockUnit", "quantityLeft");

-- Đồng bộ lại số Hiện có của từng dòng chai khí theo đúng kho tổ máy vừa phục hồi.
UPDATE "Material" material
SET "quantity" = COALESCE((
  SELECT SUM(lot."quantityLeft")::INTEGER
  FROM "MaterialStockLot" lot
  WHERE lot."materialCode" = material."code"
    AND lot."stockUnit" = material."machine"
), 0)
WHERE material."category" IN ('Chai Khí', 'Chai khí');

ALTER TABLE "MaterialStockMovement"
  ADD COLUMN IF NOT EXISTS "erpCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "MaterialStockMovement" movement
SET "erpCodes" = ARRAY[lot."erpCode"]
FROM "MaterialStockLot" lot
WHERE movement."type" = 'RECEIPT'
  AND movement."ticketId" = lot."ticketId"
  AND lot."erpCode" IS NOT NULL
  AND cardinality(movement."erpCodes") = 0;

UPDATE "MaterialStockMovement" movement
SET "erpCodes" = used."codes"
FROM (
  SELECT usage."ticketId", ARRAY_AGG(DISTINCT lot."erpCode") FILTER (WHERE lot."erpCode" IS NOT NULL) AS "codes"
  FROM "MaterialLotUsage" usage
  JOIN "MaterialStockLot" lot ON lot."id" = usage."lotId"
  GROUP BY usage."ticketId"
) used
WHERE used."ticketId" = 'movement:' || movement."id"
  AND cardinality(movement."erpCodes") = 0
  AND cardinality(used."codes") > 0;
