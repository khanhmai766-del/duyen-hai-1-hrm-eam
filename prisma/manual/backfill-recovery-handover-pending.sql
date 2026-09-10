-- Đẩy các phiếu ĐANG chờ quyết toán mà có vật tư thu hồi về bước "Xác nhận trả phiếu vật tư
-- thu hồi" mới. Chạy SAU add-recovery-handover.sql và SAU khi code đã lên (trước đó trạng
-- thái mới chưa có nghĩa với bản build cũ).
--
-- Điều kiện phải khớp `materialTicketRequiresRecovery`: chai khí không có BBTHVT nên loại ra.
-- Phiếu đã quyết toán (HOAN_TAT) KHÔNG bị đụng tới.
UPDATE "MaterialTicket"
SET "status" = 'CHO_TRA_KHO_THU_HOI'
WHERE "status" = 'CHO_QUYET_TOAN'
  AND "recoveryRequired" = TRUE
  AND "recoveryHandoverAt" IS NULL
  AND ("materialCategory" IS NULL OR "materialCategory" NOT IN ('Chai Khí', 'Chai khí'));
