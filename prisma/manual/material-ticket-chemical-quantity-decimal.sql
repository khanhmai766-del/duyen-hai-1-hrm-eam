-- Khối lượng giao (theo lịch) và khối lượng lãnh trên phiếu vật tư: số nguyên → số thập phân.
--
-- Phiếu hóa chất trước đây làm tròn tổng khối lượng các chuyến xe về số nguyên (10,86 → 11).
-- Giá trị nguyên sẵn có đổi kiểu không mất gì; luồng vật tư thường vẫn chỉ ghi số nguyên.
-- Chạy lại lần hai vẫn OK.
ALTER TABLE "MaterialTicket" ALTER COLUMN "deliveryQuantity" TYPE DOUBLE PRECISION;
ALTER TABLE "MaterialTicket" ALTER COLUMN "receivedQuantity" TYPE DOUBLE PRECISION;
