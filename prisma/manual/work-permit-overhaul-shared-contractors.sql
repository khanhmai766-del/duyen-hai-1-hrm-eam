-- Hạng mục đại tu mở thêm cho nhà thầu khác (10/10/2026) — WorkPermitOverhaulItem.sharedContractorCodes.
-- Chạy được nhiều lần (IF NOT EXISTS + chỉ thêm mã khi chưa có).
ALTER TABLE "WorkPermitOverhaulItem" ADD COLUMN IF NOT EXISTS "sharedContractorCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Sinh Lộc (mã chuẩn hoá "sinh loc") làm giàn giáo / vệ sinh trong hạng mục của EPS, IDC — file Lò hơi, sổ Cơ.
UPDATE "WorkPermitOverhaulItem"
SET "sharedContractorCodes" = array_append("sharedContractorCodes", 'sinh loc')
WHERE "source" = 'BOILER' AND "kind" = 'MECHANICAL'
  AND (("code" = '9.1.5' AND "contractorCode" = 'eps')
    OR ("code" IN ('2.4.1.2.1', '5.1.2', '2.4.1.1.1') AND "contractorCode" = 'idc'))
  AND NOT ('sinh loc' = ANY("sharedContractorCodes"));
