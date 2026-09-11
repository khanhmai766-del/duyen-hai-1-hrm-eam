-- Giải phóng số của phiếu đã hủy nhưng vẫn giữ nguyên phiếu và lịch sử cũ.
-- Chỉ áp dụng cho bảng sổ PCT đã tồn tại.
BEGIN;

DROP INDEX IF EXISTS "WorkPermit_kind_year_number_key";
CREATE UNIQUE INDEX "WorkPermit_kind_year_number_key"
  ON "WorkPermit"("kind", "year", "number") WHERE "status" <> 'CANCELLED';

COMMIT;
