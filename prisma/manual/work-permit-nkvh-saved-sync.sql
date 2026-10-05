-- Chỉ thêm cột/ràng buộc; KHÔNG tự gộp, xóa hay sửa số phiếu cũ.
-- Nếu ràng buộc báo trùng: chạy scripts/check/work-permit-number-conflicts.ts, đối chiếu trước.
BEGIN;
ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "nkvhNumber" TEXT;
ALTER TABLE "WorkPermitNumberReservation" ADD COLUMN IF NOT EXISTS "nkvhPctId" UUID;
CREATE UNIQUE INDEX IF NOT EXISTS "WorkPermit_kind_nkvhPctId_key" ON "WorkPermit" ("kind", "nkvhPctId");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkPermitNumberReservation_nkvh_pending_key"
  ON "WorkPermitNumberReservation" ("kind", "nkvhPctId") WHERE "status" = 'RESERVED' AND "nkvhPctId" IS NOT NULL;
DROP INDEX IF EXISTS "WorkPermitNumberReservation_active_number_key";
CREATE UNIQUE INDEX "WorkPermitNumberReservation_active_number_key"
  ON "WorkPermitNumberReservation" ("kind", "year", "number") WHERE "status" IN ('RESERVED', 'ISSUED', 'OBSERVED', 'OBSERVED_CONFIRMED', 'REVIEW');
COMMIT;
