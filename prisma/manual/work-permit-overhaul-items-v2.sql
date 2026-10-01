-- Hạng mục đại tu đọc trực tiếp Google Sheets (service account): khoá duy nhất đổi từ (source, sheet, code) sang
-- (source, kind, code, positionTitle) — cùng mã có ở tab nguồn "Lò- Cơ" lẫn tab cương vị thì gộp làm một.
-- Nguồn đổi tên LO/DIEN → BOILER/GENERATOR: xoá hạng mục cũ (bảng mới tạo 30/09, chưa có dữ liệu thật — chỉ
-- bản đồng bộ lại là đủ). Phiếu đã cấp giữ ảnh chụp riêng trong WorkPermit.overhaulItems, không phụ thuộc bảng này.
DROP INDEX IF EXISTS "WorkPermitOverhaulItem_source_sheet_code_key";
DELETE FROM "WorkPermitOverhaulItem" WHERE "source" IN ('LO', 'DIEN');
CREATE UNIQUE INDEX IF NOT EXISTS "WorkPermitOverhaulItem_source_kind_code_positionTitle_key"
  ON "WorkPermitOverhaulItem"("source", "kind", "code", "positionTitle");
