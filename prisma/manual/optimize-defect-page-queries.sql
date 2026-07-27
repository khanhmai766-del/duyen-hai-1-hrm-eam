-- Dữ liệu cũ đã ở trạng thái Đã xử lý nhưng chưa có mốc 14 ngày:
-- ưu tiên ngày hoàn tất từ nguồn, sau đó dùng lần cập nhật gần nhất.
UPDATE "Defect"
SET "completedAt" = COALESCE("sourceCompletedAt", "updatedAt")
WHERE "status" = 'DA_XU_LY'
  AND "completedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Defect_unit_requestType_detectedAt_idx"
  ON "Defect" ("unit", "requestType", "detectedAt" DESC);

CREATE INDEX IF NOT EXISTS "Defect_unit_requestType_status_severity_idx"
  ON "Defect" ("unit", "requestType", "status", "severity");

CREATE INDEX IF NOT EXISTS "Defect_status_completedAt_idx"
  ON "Defect" ("status", "completedAt" DESC);

CREATE INDEX IF NOT EXISTS "DefectSyncRun_status_startedAt_idx"
  ON "DefectSyncRun" ("status", "startedAt" DESC);

ANALYZE "Defect";
ANALYZE "DefectSyncRun";
