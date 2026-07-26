-- Chỉ mục phục vụ trang danh sách khiếm khuyết phân trang/lọc phía máy chủ.
-- Dùng CREATE INDEX IF NOT EXISTS để có thể chạy lại an toàn trên server.
CREATE INDEX IF NOT EXISTS "Defect_unit_sourceType_syncState_idx"
  ON "Defect" ("unit", "sourceType", "syncState");

CREATE INDEX IF NOT EXISTS "Defect_unit_status_severity_idx"
  ON "Defect" ("unit", "status", "severity");

CREATE INDEX IF NOT EXISTS "Defect_sourceStatusMismatch_detectedAt_idx"
  ON "Defect" ("sourceStatusMismatch", "detectedAt" DESC);

CREATE INDEX IF NOT EXISTS "Defect_unit_deviceSeq_idx"
  ON "Defect" ("unit", "deviceSeq");
