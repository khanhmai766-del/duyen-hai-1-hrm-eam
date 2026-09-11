-- Khối lượng thực dùng trên dòng lịch sử thay thế: số nguyên → số thập phân.
--
-- Một phiếu gắn nhiều thiết bị nay được CHIA ĐỀU khối lượng thực dùng theo số thiết bị và
-- làm tròn 2 chữ số (220 kg / 6 trạm = 36,67 kg), nên cột phải chứa được phần thập phân.
-- Giá trị nguyên sẵn có đổi kiểu không mất gì. Chạy lại lần hai vẫn OK.
ALTER TABLE "MaterialReplacementLog" ALTER COLUMN "usedQuantity" TYPE DOUBLE PRECISION;
