ALTER TABLE "Defect"
  ADD COLUMN IF NOT EXISTS "requestNumberReleasedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "requestNumberReusedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "requestNumberReusedById" TEXT;

CREATE INDEX IF NOT EXISTS "Defect_requestType_requestNumberReleasedAt_requestNumberReusedAt_idx"
  ON "Defect"("requestType", "requestNumberReleasedAt", "requestNumberReusedAt");
