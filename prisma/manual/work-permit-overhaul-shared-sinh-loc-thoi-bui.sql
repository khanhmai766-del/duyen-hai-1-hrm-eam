-- Mở hạng mục 7.6.1.2 (Thay mới van tay tổng cấp hơi thổi bụi, D ≤ DN65) và 7.6.1.3 (Thay mới van điện tổng cấp hơi
-- thổi bụi, D ≤ DN65) của IDC cho Sinh Lộc (25/10/2026) — Sinh Lộc tháo / lắp giàn giáo phục vụ hai hạng mục, Lò S2.
-- Đánh dấu làm chung (sharedJointWork): PCT có hai hạng mục này cho nhân sự IDC và Sinh Lộc cùng quét vào/ra.
-- Cần cột "sharedContractorCodes" (work-permit-overhaul-shared-contractors.sql). Chạy được nhiều lần.
ALTER TABLE "WorkPermitOverhaulItem" ADD COLUMN IF NOT EXISTS "sharedJointWork" BOOLEAN NOT NULL DEFAULT false;

-- Soát trước: SELECT "source","sheet","kind","positionCode","code","device" FROM "WorkPermitOverhaulItem"
--   WHERE "contractorCode" = 'idc' AND "code" IN ('7.6.1.2', '7.6.1.3');
UPDATE "WorkPermitOverhaulItem"
SET "sharedContractorCodes" = CASE WHEN 'sinh loc' = ANY("sharedContractorCodes") THEN "sharedContractorCodes"
                                   ELSE array_append("sharedContractorCodes", 'sinh loc') END,
    "sharedJointWork" = true
WHERE "source" = 'BOILER' AND "contractorCode" = 'idc' AND "code" IN ('7.6.1.2', '7.6.1.3');
