-- Luồng hóa chất: bước Thống kê / Kỹ thuật viên xác nhận đề xuất chốt lịch giao hàng và
-- khối lượng giao. Hóa chất mua theo lô, giao bằng xe bồn theo hợp đồng nên phải hẹn ngày.
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "deliveryScheduledAt" TIMESTAMP(3);
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "deliveryQuantity" INTEGER;
