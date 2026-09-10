-- Mở lại các phiếu ĐÃ HOÀN TẤT có vật tư thu hồi để thu thập nốt thông tin trả phiếu (biên
-- bản) thu hồi cho kho — bước cuối mới thêm ngày 10/09/2026.
--
-- An toàn vì mốc "phiếu đang mở" ở cổng vật tư và chỗ neo SYC đã đổi sang `settledAt IS NULL`
-- (commit 88ca71d): các phiếu này đã quyết toán nên vẫn KHÔNG bị tính là đang mở, điểm thay
-- thế của chúng không lọt cổng. Số liệu thực dùng đã khóa từ lúc quyết toán, bước cuối không
-- đụng tới. Sau khi người dùng xác nhận trả phiếu, phiếu quay lại HOAN_TAT.
--
-- Điều kiện khớp `materialTicketRequiresRecovery`: chai khí không có BBTHVT nên loại ra;
-- lấy cả phiếu có sẵn tệp BBTHVT lẫn phiếu chỉ có cờ thu hồi (tệp xuất lỗi).
-- Idempotent: chạy lại không đụng phiếu nào đã có "recoveryHandoverAt".
UPDATE "MaterialTicket"
SET "status" = 'CHO_TRA_KHO_THU_HOI'
WHERE "status" = 'HOAN_TAT'
  AND "settledAt" IS NOT NULL
  AND "recoveryHandoverAt" IS NULL
  AND ("recoveryRequired" = TRUE OR "recoveryDocUrl" IS NOT NULL)
  AND ("materialCategory" IS NULL OR "materialCategory" NOT IN ('Chai Khí', 'Chai khí'));
