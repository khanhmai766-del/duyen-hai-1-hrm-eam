-- Tầng 2 — Index kép cho truy vấn lịch sử "của thiết bị X, mới nhất trước".
-- Với index kép (khóa, thời_gian DESC), câu "N bản ghi gần nhất của X" đọc đúng
-- N dòng từ index thay vì lấy hết rồi sort.
-- Idempotent: chạy lại nhiều lần an toàn. Áp bằng:
--   npx prisma db execute --file scripts/sql/history-indexes-tang2.sql --schema prisma/schema.prisma
--
-- Ghi chú kiểm chứng theo code (không làm theo cảm tính):
-- * RepairLog KHÔNG cần thêm — đã có (deviceSeq, startedAt) khớp đúng query
--   orderBy startedAt desc (Postgres scan ngược index là ra DESC).
-- * MaterialReplacement KHÔNG có cột replacedAt — lịch sử nằm ở MaterialReplacementLog.

-- Vật tư đã dùng cho thiết bị (lý lịch thiết bị: orderBy usedAt desc)
CREATE INDEX IF NOT EXISTS "EquipmentMaterial_deviceSeq_usedAt_idx"
  ON "EquipmentMaterial"("deviceSeq", "usedAt" DESC);

-- Lịch sử các lần thay vật tư tại một điểm thay thế (orderBy replacedAt desc)
CREATE INDEX IF NOT EXISTS "MaterialReplacementLog_replacementId_replacedAt_idx"
  ON "MaterialReplacementLog"("replacementId", "replacedAt" DESC);

-- Khiếm khuyết theo thiết bị (deviceSeq từ Tầng 1; list orderBy createdAt desc)
CREATE INDEX IF NOT EXISTS "Defect_deviceSeq_createdAt_idx"
  ON "Defect"("deviceSeq", "createdAt" DESC);
