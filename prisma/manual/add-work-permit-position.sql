-- Cương vị nghiệp vụ gắn với PCT; chuỗi rỗng biểu thị tất cả cương vị.
BEGIN;

ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "position" TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "WorkPermit_kind_position_workDate_idx"
  ON "WorkPermit" ("kind", "position", "workDate");

COMMIT;
