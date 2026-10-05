-- Chỉ cập nhật ràng buộc chống trùng cho trạng thái số NKVH đã được người cấp xác nhận.
-- Không sửa/xóa phiếu, lượt giữ số hoặc lịch sử. OBSERVED cũ giữ nguyên để đối chiếu.
BEGIN;
DROP INDEX IF EXISTS "WorkPermitNumberReservation_active_number_key";
CREATE UNIQUE INDEX "WorkPermitNumberReservation_active_number_key"
  ON "WorkPermitNumberReservation" ("kind", "year", "number")
  WHERE "status" IN ('RESERVED', 'ISSUED', 'OBSERVED', 'OBSERVED_CONFIRMED', 'REVIEW');
COMMIT;
