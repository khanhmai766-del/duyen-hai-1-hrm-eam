-- Mở thêm hạng mục 9.2.1.8 (Đại tu cơ cấu búa gõ cực phóng, cực lắng ESP) của EPS cho Sinh Lộc (19/10/2026).
-- File Lò hơi, tab "ESP - Điện", cương vị ESP — bổ sung cho work-permit-overhaul-shared-sinh-loc-esp.sql.
-- Cần cột "sharedContractorCodes" (work-permit-overhaul-shared-contractors.sql). Chạy được nhiều lần.
UPDATE "WorkPermitOverhaulItem"
SET "sharedContractorCodes" = array_append("sharedContractorCodes", 'sinh loc')
WHERE "source" = 'BOILER' AND "contractorCode" = 'eps' AND "positionCode" = 'ESP'
  AND "kind" = 'ELECTRICAL' AND "sheet" = 'ESP - Điện' AND "code" = '9.2.1.8'
  AND NOT ('sinh loc' = ANY("sharedContractorCodes"));
