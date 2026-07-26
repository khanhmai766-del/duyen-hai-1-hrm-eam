-- Tính lại childCount (denormalize) cho TOÀN BỘ cây thiết bị.
-- An toàn/idempotent: chỉ cập nhật đúng giá trị thực tế, không thêm/xóa dòng nào.
-- Dùng để sửa dữ liệu cũ bị lệch do trước đây thêm/xóa thiết bị không cập nhật childCount
-- (thư mục cha bị vẽ nhầm thành thiết bị lá trên cây lazy). Chạy lại bao nhiêu lần cũng được.
UPDATE "EquipmentNode" p
SET "childCount" = (
  SELECT COUNT(*)::int FROM "EquipmentNode" c WHERE c."parentSeq" = p.seq
);
