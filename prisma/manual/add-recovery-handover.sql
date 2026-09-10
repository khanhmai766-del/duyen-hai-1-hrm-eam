-- Bước "Xác nhận trả phiếu vật tư thu hồi" (CHO_TRA_KHO_THU_HOI), chèn giữa bước xuất biên bản
-- và bước Quyết toán, chỉ áp cho phiếu có Biên bản vật tư thu hồi.
-- Thuần additive + idempotent: chạy lại lần hai vẫn OK.
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "recoveryHandoverAt" TIMESTAMP(3);
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "recoveryHandoverById" TEXT;
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "recoveryHandoverByName" TEXT;
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "recoveryHandoverByPosition" TEXT;
