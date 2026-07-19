-- Cột "Kho VTTB" (kho vật tư thiết bị) cho danh mục vật tư ERP.
ALTER TABLE "ErpMaterial" ADD COLUMN IF NOT EXISTS "warehouse" TEXT;
