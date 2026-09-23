-- Bỏ cột "Nguồn / phiếu mẫu" của danh mục biện pháp an toàn PCT (23/09/2026).
-- Người dùng không còn tra theo tên phiếu mẫu; cột chỉ còn là chữ thừa trên bảng.
-- ⚠️ XOÁ DỮ LIỆU: nội dung cột này mất hẳn, không khôi phục được ngoài bản sao lưu DB.
-- searchText của các dòng cũ vẫn chứa chữ của nguồn — vô hại, sẽ được ghi lại khi sửa dòng.
ALTER TABLE "WorkPermitSafetyMeasure" DROP COLUMN IF EXISTS "source";
