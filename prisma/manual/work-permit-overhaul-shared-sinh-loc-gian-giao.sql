-- Mở 16 hạng mục lắp dựng / tháo dỡ giàn giáo của EPS (file Máy phát, tab Trực chính điện, sổ Điện) cho Sinh Lộc (10/10/2026).
-- Cần cột "sharedContractorCodes" (work-permit-overhaul-shared-contractors.sql). Chạy được nhiều lần.
-- Hạng mục mở lẻ chỉ hiện cho PCT Sinh Lộc có cương vị Trực chính điện (ràng đúng cương vị đã phân).
UPDATE "WorkPermitOverhaulItem"
SET "sharedContractorCodes" = array_append("sharedContractorCodes", 'sinh loc')
WHERE "source" = 'GENERATOR' AND "kind" = 'ELECTRICAL' AND "sheet" = 'Trực chính điện' AND "contractorCode" = 'eps'
  AND "code" IN ('1.2.5.1.3', '2.2.4', '2.2.5', '4.1.1.1.19',
                 '13.1.1', '13.1.2', '13.1.3', '13.1.4', '13.1.5', '13.1.6',
                 '13.1.16', '13.1.17', '13.1.18', '13.1.19', '13.1.20', '13.1.21')
  AND NOT ('sinh loc' = ANY("sharedContractorCodes"));
