ALTER TABLE "MaterialReplacement"
ADD COLUMN "recoveryOnSupplement" BOOLEAN NOT NULL DEFAULT false;

-- Bật sẵn cho cấu hình hiện hữu: dầu EA tại cương vị Máy nghiền.
UPDATE "MaterialReplacement" AS r
SET "recoveryOnSupplement" = true
FROM "Material" AS m
WHERE r."materialId" = m."id"
  AND (
    r."managingPosition" ILIKE '%Máy nghiền%'
    OR r."managingPositionCode" = 'COAL_MILL'
  )
  AND m."name" ILIKE '%EA Ultra%';
