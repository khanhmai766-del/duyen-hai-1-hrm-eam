-- Ảnh phiếu xuất kho liên 3 gắn vào lô (số phiếu giao hàng), kèm theo BBTHVT.
-- Additive, chạy được nhiều lần; KHÔNG dùng `prisma db push` trên prod.
ALTER TABLE "MaterialStockLot" ADD COLUMN IF NOT EXISTS "deliveryPhotoKey" TEXT;
ALTER TABLE "MaterialStockLot" ADD COLUMN IF NOT EXISTS "deliveryPhotoAt" TIMESTAMP(3);
ALTER TABLE "MaterialStockLot" ADD COLUMN IF NOT EXISTS "deliveryPhotoByName" TEXT;
