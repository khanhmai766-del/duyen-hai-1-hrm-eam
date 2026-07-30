ALTER TABLE "Defect"
  ADD COLUMN IF NOT EXISTS "mappedDeviceUnit" TEXT;

ALTER TABLE "DefectRelatedDevice"
  ADD COLUMN IF NOT EXISTS "mappedUnit" TEXT;

ALTER TABLE "DefectHistory"
  ADD COLUMN IF NOT EXISTS "mappedDeviceUnit" TEXT;

ALTER TABLE "DefectHistoryRelatedDevice"
  ADD COLUMN IF NOT EXISTS "mappedUnit" TEXT;

-- Chỉ backfill các trường hợp suy ra chắc chắn. Phiếu COMMON đã gắn vào nhánh
-- không-COMMON không thể biết là hồ sơ S1 hay S2, nên để null để Vận hành chọn lại.
UPDATE "Defect"
SET "mappedDeviceUnit" = CASE
  WHEN "deviceSeq" LIKE 'DH1.S1.5.%' OR "deviceSeq" LIKE 'DH1.S1.6.%' THEN 'COMMON'
  WHEN "unit" IN ('S1', 'S2') THEN "unit"
  ELSE NULL
END
WHERE "mappedDeviceUnit" IS NULL AND "deviceSeq" IS NOT NULL;

UPDATE "DefectRelatedDevice" related
SET "mappedUnit" = CASE
  WHEN related."deviceSeq" LIKE 'DH1.S1.5.%' OR related."deviceSeq" LIKE 'DH1.S1.6.%' THEN 'COMMON'
  WHEN defect."unit" IN ('S1', 'S2') THEN defect."unit"
  ELSE NULL
END
FROM "Defect" defect
WHERE related."defectId" = defect."id" AND related."mappedUnit" IS NULL;

UPDATE "DefectHistory"
SET "mappedDeviceUnit" = CASE
  WHEN "deviceSeq" LIKE 'DH1.S1.5.%' OR "deviceSeq" LIKE 'DH1.S1.6.%' THEN 'COMMON'
  WHEN "unit" IN ('S1', 'S2') THEN "unit"
  ELSE NULL
END
WHERE "mappedDeviceUnit" IS NULL AND "deviceSeq" IS NOT NULL;

UPDATE "DefectHistoryRelatedDevice" related
SET "mappedUnit" = CASE
  WHEN related."deviceSeq" LIKE 'DH1.S1.5.%' OR related."deviceSeq" LIKE 'DH1.S1.6.%' THEN 'COMMON'
  WHEN history."unit" IN ('S1', 'S2') THEN history."unit"
  ELSE NULL
END
FROM "DefectHistory" history
WHERE related."historyId" = history."id" AND related."mappedUnit" IS NULL;
