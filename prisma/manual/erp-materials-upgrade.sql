-- Nâng cấp an toàn cho tính năng Danh mục vật tư ERP.
-- Có thể chạy lại nhiều lần; không xoá bảng hoặc dữ liệu nghiệp vụ.

CREATE TABLE IF NOT EXISTS "ErpMaterial" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "erpStock" INTEGER NOT NULL DEFAULT 0,
  "category" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ErpMaterial_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Material"
  ADD COLUMN IF NOT EXISTS "erpCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "MaterialTicketItem"
  ADD COLUMN IF NOT EXISTS "erpCode" TEXT,
  ADD COLUMN IF NOT EXISTS "replacementQuantity" INTEGER;

-- Trước đây mã vật tư là duy nhất toàn hệ thống; hiện nay cùng một mã có thể
-- xuất hiện ở các tổ máy khác nhau nhưng vẫn phải duy nhất trong từng tổ máy.
DROP INDEX IF EXISTS "Material_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Material_code_machine_key"
  ON "Material"("code", "machine");

CREATE UNIQUE INDEX IF NOT EXISTS "ErpMaterial_code_key"
  ON "ErpMaterial"("code");
CREATE INDEX IF NOT EXISTS "ErpMaterial_code_idx"
  ON "ErpMaterial"("code");
CREATE INDEX IF NOT EXISTS "ErpMaterial_category_idx"
  ON "ErpMaterial"("category");
CREATE INDEX IF NOT EXISTS "ErpMaterial_erpStock_idx"
  ON "ErpMaterial"("erpStock");
