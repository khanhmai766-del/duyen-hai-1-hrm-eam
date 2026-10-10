-- Mở 5 hạng mục ESP của EPS (file Lò hơi, cương vị ESP) cho Sinh Lộc (10/10/2026) — PCT 4673, 4674/2026 cần bổ sung hạng mục.
-- Tab "ESP - Cơ": 9.1.3, 9.1.4. Tab "ESP - Điện": 9.2.1.5, 9.2.1.6, 9.2.1.7 (hạng mục mở lẻ ràng theo cương vị nên PCT Cơ ESP vẫn thấy).
-- Cần cột "sharedContractorCodes" (work-permit-overhaul-shared-contractors.sql). Chạy được nhiều lần.
UPDATE "WorkPermitOverhaulItem"
SET "sharedContractorCodes" = array_append("sharedContractorCodes", 'sinh loc')
WHERE "source" = 'BOILER' AND "contractorCode" = 'eps' AND "positionCode" = 'ESP'
  AND (("kind" = 'MECHANICAL' AND "sheet" = 'ESP - Cơ' AND "code" IN ('9.1.3', '9.1.4'))
    OR ("kind" = 'ELECTRICAL' AND "sheet" = 'ESP - Điện' AND "code" IN ('9.2.1.5', '9.2.1.6', '9.2.1.7')))
  AND NOT ('sinh loc' = ANY("sharedContractorCodes"));
