ALTER TABLE "DefectReminderLog"
  ADD COLUMN IF NOT EXISTS "shiftLeaderId" TEXT,
  ADD COLUMN IF NOT EXISTS "shiftLeaderName" TEXT;

-- Các lần nhắc đã ghi trước khi có trường snapshot dùng Trưởng ca của phiếu
-- làm dữ liệu chuyển tiếp. Các lần nhắc mới luôn bắt buộc chọn riêng trên form.
UPDATE "DefectReminderLog" AS log
SET
  "shiftLeaderId" = defect."shiftLeaderId",
  "shiftLeaderName" = defect."shiftLeaderName"
FROM "Defect" AS defect
WHERE log."defectId" = defect.id
  AND log."shiftLeaderId" IS NULL;
