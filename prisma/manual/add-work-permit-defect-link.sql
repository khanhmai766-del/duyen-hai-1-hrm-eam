-- Liên kết ổn định PCT với SYC đã chọn trong Sổ cấp PCT.
-- Giữ repairRequestNumber làm snapshot số SYC; defectId là liên kết mềm để tra ngược.
ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "defectId" TEXT;

CREATE INDEX IF NOT EXISTS "WorkPermit_defectId_idx" ON "WorkPermit"("defectId");

-- Không tự ghép PCT cũ theo repairRequestNumber: số SYC có thể trùng hoặc được
-- tái sử dụng. Dữ liệu cũ giữ nguyên; chỉ gắn sau khi rà soát và chọn đúng SYC.
