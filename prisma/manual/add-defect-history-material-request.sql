-- DefectHistory.isMaterialRequest — cờ phẳng cho biết bản ghi lịch sử sinh từ SYC
-- thay thế vật tư (hiển thị ở tab "Lịch sử thay thế", không hiện ở Lịch sử sửa chữa).
--
-- Trước đó API phải nạp toàn bộ id phiếu SYC rồi lọc bằng NOT IN, tốn một seq scan
-- trên Defect mỗi lần mở Lịch sử sửa chữa, và danh sách id phình theo từng chu kỳ
-- thay thế. Cột này biến bộ lọc thành một vị từ thường trên chính bảng lịch sử.
--
-- Additive, an toàn chạy lại nhiều lần.

ALTER TABLE "DefectHistory"
  ADD COLUMN IF NOT EXISTS "isMaterialRequest" BOOLEAN NOT NULL DEFAULT false;

-- Backfill các bản ghi đã có. Chạy trên prod ngày 2026-08-06 khớp 0 dòng
-- (chưa từng có SYC nào được ra) — càng để lâu càng nhiều dòng phải sửa.
UPDATE "DefectHistory" h
   SET "isMaterialRequest" = true
 WHERE h."defectId" IN (SELECT d.id FROM "Defect" d WHERE d."isMaterialRequest")
   AND h."isMaterialRequest" = false;
