-- =====================================================================
-- DỌN EquipmentProfile: xoá các dòng KHÔNG ghi đè gì.
--
-- Bối cảnh: scripts/create-s2-from-s1.mjs từng tạo một dòng
-- EquipmentProfile(machine='S2') cho MỌI nút thuộc nhánh 1,2,3,7 chỉ để
-- đánh dấu "đã có hồ sơ S2". Nhưng phạm vi tổ máy của một nút đã được suy
-- ra hoàn toàn từ số nhánh của seq (machinesOf() trong lib/equipment-units.ts:
-- nhánh 5,6 → COMMON; còn lại → S1+S2), nên các dòng đó không mang thông tin
-- nào — chúng lặp lại một sự thật đã tính được bằng regex.
--
-- Bảng chỉ còn đúng một vai trò: LƯU GHI ĐÈ tên/KKS/ảnh/tài liệu khi một tổ
-- máy đặt khác đi. Câu lệnh dưới đây chỉ xoá dòng rỗng hoàn toàn nên không
-- có ghi đè nào bị mất, và chạy lại nhiều lần đều an toàn.
--
-- Chạy:
--   npx prisma db execute --file prisma/sql/purge-empty-equipment-profiles.sql --schema prisma/schema.prisma
--
-- Muốn trả lại luôn dung lượng đĩa thì chạy thêm câu dưới đây NGOÀI transaction
-- (`prisma db execute` bọc transaction nên không nhận VACUUM) — bằng psql, hoặc
-- prisma.$executeRawUnsafe('VACUUM (FULL, ANALYZE) "EquipmentProfile"'):
--   VACUUM (FULL, ANALYZE) "EquipmentProfile";
-- Trên dev: 4016 kB → 32 kB. VACUUM FULL khoá bảng, nên chạy lúc ít người dùng.
-- =====================================================================

DELETE FROM "EquipmentProfile"
WHERE "name" IS NULL
  AND "kks" IS NULL
  AND "attachedInfo" IS NULL
  AND "documentUrl" IS NULL
  AND "imageUrl" IS NULL;

-- Làm mới thống kê cho planner (autovacuum sẽ thu hồi chỗ trống sau).
ANALYZE "EquipmentProfile";
