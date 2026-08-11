-- Cờ phân biệt lịch sử của phiếu SYC thay thế vật tư với lịch sử khiếm khuyết
-- thông thường. Additive và an toàn khi database đã được cập nhật thủ công trước đó.
ALTER TABLE "DefectHistory"
  ADD COLUMN IF NOT EXISTS "isMaterialRequest" BOOLEAN NOT NULL DEFAULT false;

-- Gắn lại đúng loại cho dữ liệu lịch sử đã tồn tại trước khi có cột này.
UPDATE "DefectHistory" h
   SET "isMaterialRequest" = true
 WHERE h."defectId" IN (
   SELECT d.id
     FROM "Defect" d
    WHERE d."isMaterialRequest" = true
 )
   AND h."isMaterialRequest" = false;
