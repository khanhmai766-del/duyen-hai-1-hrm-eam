-- Phạm vi dữ liệu: gắn các PCT nhà thầu hiện có vào nhóm SCTX để giữ nguyên cách quản lý cũ.
ALTER TABLE "WorkPermit"
  ADD COLUMN IF NOT EXISTS "contractorScope" TEXT;

UPDATE "WorkPermit"
SET "contractorScope" = 'SCTX'
WHERE "teamType" = 'CONTRACTOR'
  AND "contractorScope" IS NULL;

CREATE INDEX IF NOT EXISTS "WorkPermit_kind_contractorScope_workDate_idx"
  ON "WorkPermit"("kind", "contractorScope", "workDate");
