-- Chia lại khối lượng THỰC DÙNG trên các dòng lịch sử thay thế đã ghi theo cách chia cũ.
--
-- Chỉ áp cho phiếu DẦU BÔI TRƠN và HÓA CHẤT (xem `splitsUsageEvenly`): mỗi thiết bị nhận
-- cùng một phần = tổng thực dùng của phiếu / tổng số thiết bị, làm tròn 2 chữ số; điểm có
-- N thiết bị nhận N phần. Vật tư đếm được (lõi lọc, bi nghiền…) KHÔNG đụng tới.
--
-- Cách chia cũ dồn TOÀN BỘ vào điểm đầu khi mọi điểm khai định mức 0 — điểm dầu thường như
-- vậy — nên phiếu 220 kg cho 6 trạm ghi ra 220 / 0 / 0 / 0 / 0 / 0.
--
-- Chạy SAU material-replacement-log-used-quantity-decimal.sql (cột phải là số thập phân).
-- Idempotent: dòng đã đúng luật mới thì không bị ghi lại; bảng sao lưu chỉ tạo một lần.

CREATE TABLE IF NOT EXISTS "_backup_MaterialReplacementLog_usedqty_20260911" AS
SELECT l.*
FROM "MaterialReplacementLog" l
JOIN "MaterialTicket" t ON t.id = l."ticketId"
WHERE l."ticketId" IS NOT NULL
  AND l."unplanned" = FALSE
  AND t."materialCategory" IN ('Dầu bôi trơn', 'Hóa chất');

WITH logs AS (
  SELECT l.id, l."ticketId", GREATEST(COALESCE(r."deviceCount", 1), 1) AS so_tb
  FROM "MaterialReplacementLog" l
  JOIN "MaterialTicket" t ON t.id = l."ticketId"
  LEFT JOIN "MaterialReplacement" r ON r.id = l."replacementId"
  WHERE l."ticketId" IS NOT NULL
    AND l."unplanned" = FALSE
    AND t."materialCategory" IN ('Dầu bôi trơn', 'Hóa chất')
),
per_ticket AS (
  SELECT "ticketId", SUM(so_tb) AS tong_tb
  FROM logs GROUP BY "ticketId" HAVING COUNT(*) >= 2
),
target AS (
  SELECT lg.id,
         ROUND(ROUND(GREATEST(t."usedQuantity", 0)::numeric / pt.tong_tb, 2) * lg.so_tb, 2)::double precision AS moi
  FROM logs lg
  JOIN per_ticket pt ON pt."ticketId" = lg."ticketId"
  JOIN "MaterialTicket" t ON t.id = lg."ticketId"
)
UPDATE "MaterialReplacementLog" l
SET "usedQuantity" = target.moi
FROM target
WHERE l.id = target.id
  AND l."usedQuantity" IS DISTINCT FROM target.moi;
