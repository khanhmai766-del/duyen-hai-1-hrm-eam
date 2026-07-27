CREATE INDEX IF NOT EXISTS "Defect_unit_requestType_detectedAt_idx"
  ON "Defect" ("unit", "requestType", "detectedAt" DESC);

CREATE INDEX IF NOT EXISTS "Defect_unit_requestType_status_severity_idx"
  ON "Defect" ("unit", "requestType", "status", "severity");

CREATE INDEX IF NOT EXISTS "DefectSyncRun_status_startedAt_idx"
  ON "DefectSyncRun" ("status", "startedAt" DESC);

ANALYZE "Defect";
ANALYZE "DefectSyncRun";
