-- =====================================================================
-- GỠ INDEX TRÙNG LẶP trên các bảng nghiệp vụ phình theo thời gian
-- (khiếm khuyết, lịch sử, vật tư).
--
-- Nguyên tắc: index B-tree (a, b) phục vụ được mọi truy vấn chỉ lọc/sắp theo
-- cột đầu `a`, nên index đơn (a) là thừa hoàn toàn khi đã có (a, b). Mỗi index
-- thừa vẫn phải cập nhật ở MỌI lần INSERT/UPDATE và vẫn chiếm chỗ trong bộ nhớ
-- đệm — đúng chi phí không cần trả khi bảng lớn dần.
--
-- Mỗi dòng dưới đây ghi rõ index composite nào đã bao phủ nó.
-- An toàn chạy lại nhiều lần (IF EXISTS). Không đụng tới dữ liệu.
--
-- Chạy:
--   npx prisma db execute --file prisma/sql/drop-redundant-indexes.sql --schema prisma/schema.prisma
-- =====================================================================

-- Đã có "Defect_deviceSeq_createdAt_idx" (deviceSeq, createdAt DESC)
DROP INDEX IF EXISTS "Defect_deviceSeq_idx";
-- Đã có "Defect_status_completedAt_idx" (status, completedAt DESC)
DROP INDEX IF EXISTS "Defect_status_idx";
-- Đã có "Defect_unit_status_severity_idx" (unit, status, severity)
DROP INDEX IF EXISTS "Defect_unit_status_idx";

-- Đã có "DefectHistory_deviceSeq_performedAt_idx" (deviceSeq, performedAt DESC)
DROP INDEX IF EXISTS "DefectHistory_deviceSeq_idx";

-- Đã có "RepairLog_deviceSeq_machine_idx" (deviceSeq, machine)
-- và "RepairLog_deviceSeq_startedAt_idx" (deviceSeq, startedAt)
DROP INDEX IF EXISTS "RepairLog_deviceSeq_idx";

-- Đã có "EquipmentMaterial_deviceSeq_usedAt_idx" (deviceSeq, usedAt DESC)
DROP INDEX IF EXISTS "EquipmentMaterial_deviceSeq_idx";

-- Đã có "MaterialReplacementLog_replacementId_replacedAt_idx" (replacementId, replacedAt DESC)
DROP INDEX IF EXISTS "MaterialReplacementLog_replacementId_idx";

-- Làm mới thống kê để planner chọn lại index còn lại.
ANALYZE "Defect";
ANALYZE "DefectHistory";
ANALYZE "RepairLog";
ANALYZE "EquipmentMaterial";
ANALYZE "MaterialReplacementLog";
