-- Cờ giữ chỗ cho nút cây thiết bị đã sắp xếp lại tay.
-- Lệnh nhập danh mục khớp theo Assetid và ghi đè seq/parentSeq theo file Excel; không có cờ
-- này thì mọi lần sắp xếp lại trên web đều bị lần nhập kế tiếp kéo về chỗ cũ.
ALTER TABLE "EquipmentNode" ADD COLUMN IF NOT EXISTS "relocated" BOOLEAN NOT NULL DEFAULT false;
