-- Người giám sát an toàn điện là thông tin tùy chọn trên PCT Điện giấy.
BEGIN;
ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "electricalSafetySupervisorName" TEXT NOT NULL DEFAULT '';
COMMIT;
