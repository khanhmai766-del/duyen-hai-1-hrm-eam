-- Lưu tiến độ lũy kế khi kết thúc từng lần làm việc của nhà thầu.
BEGIN;

ALTER TABLE "WorkPermitSession" ADD COLUMN IF NOT EXISTS "progress" INTEGER;
ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "progress" INTEGER;

ALTER TABLE "WorkPermitSession" DROP CONSTRAINT IF EXISTS "WorkPermitSession_progress_range";
ALTER TABLE "WorkPermitSession" ADD CONSTRAINT "WorkPermitSession_progress_range"
  CHECK ("progress" IS NULL OR ("progress" >= 0 AND "progress" <= 100));

ALTER TABLE "WorkPermit" DROP CONSTRAINT IF EXISTS "WorkPermit_progress_range";
ALTER TABLE "WorkPermit" ADD CONSTRAINT "WorkPermit_progress_range"
  CHECK ("progress" IS NULL OR ("progress" >= 0 AND "progress" <= 100));

COMMIT;
