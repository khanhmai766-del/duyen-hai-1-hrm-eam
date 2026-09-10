-- SỬA THỨ TỰ BƯỚC (10/09/2026): bước "Trả phiếu vật tư thu hồi" chuyển từ TRƯỚC Quyết toán
-- xuống thành bước CUỐI CÙNG, sau Quyết toán.
--
-- Bản deploy trước đã đẩy các phiếu đang Chờ quyết toán sang trạng thái mới
-- (backfill-recovery-handover-pending.sql). Với thứ tự mới, những phiếu đó phải quay về
-- Chờ quyết toán: chưa quyết toán mà xác nhận trả phiếu là phiếu hoàn tất KHÔNG có dòng
-- MaterialReplacementLog nào — mất luôn số thực dùng của biểu dự toán năm.
--
-- Chỉ đụng phiếu CHƯA quyết toán và CHƯA ai xác nhận trả phiếu; phiếu đã quyết toán rồi mà
-- đang chờ trả phiếu thu hồi thì để nguyên.
UPDATE "MaterialTicket"
SET "status" = 'CHO_QUYET_TOAN'
WHERE "status" = 'CHO_TRA_KHO_THU_HOI'
  AND "settledAt" IS NULL
  AND "recoveryHandoverAt" IS NULL;
