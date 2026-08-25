-- Giai đoạn 4 · Mạch vòng kín vật tư
-- Bảng chỉ tiêu kế hoạch năm theo biểu QLVT.20.
-- Migration additive: không xoá, không đổi kiểu và không chạm dữ liệu hiện có.

CREATE TABLE IF NOT EXISTS "MaterialAnnualPlan" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "materialCategory" TEXT NOT NULL,
  "materialNameKey" TEXT NOT NULL,
  "materialNameLabel" TEXT NOT NULL,
  "erpCode" TEXT,
  "materialId" TEXT,
  "unitLabel" TEXT NOT NULL,
  "plannedQuantity" DECIMAL(18,4) NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MaterialAnnualPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaterialAnnualPlan_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "Material"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "MaterialAnnualPlan_year_materialCategory_materialNameKey_key"
  ON "MaterialAnnualPlan"("year", "materialCategory", "materialNameKey");

CREATE INDEX IF NOT EXISTS "MaterialAnnualPlan_year_materialCategory_idx"
  ON "MaterialAnnualPlan"("year", "materialCategory");

CREATE INDEX IF NOT EXISTS "MaterialAnnualPlan_erpCode_idx"
  ON "MaterialAnnualPlan"("erpCode");

CREATE INDEX IF NOT EXISTS "MaterialAnnualPlan_materialId_idx"
  ON "MaterialAnnualPlan"("materialId");

-- Khôi phục mã chuẩn cho cơ sở dữ liệu cũ chưa từng nhập tab hợp đồng. NH3 không
-- có dòng hợp đồng nên đặc biệt không thể tự suy ra bằng luồng import hóa chất.
UPDATE "ChemicalInventoryItem" AS item
SET "materialCode" = mapping."materialCode"
FROM (VALUES
  ('NH3_99', '1.61.16.003.VIE.00.000'),
  ('NACLO_10', '1.61.26.003.VIE.00.000'),
  ('HCL_31', '1.61.06.038.VIE.00.000'),
  ('NAOH_32', '1.61.16.008.VIE.00.000'),
  ('PAC_12', '1.61.86.566.VIE.02.000'),
  ('NH4OH_20', '1.61.86.518.VIE.00.000')
) AS mapping("code", "materialCode")
WHERE item."code" = mapping."code"
  AND item."materialCode" IS NULL;
