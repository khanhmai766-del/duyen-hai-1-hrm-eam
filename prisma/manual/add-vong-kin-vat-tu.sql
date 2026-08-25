-- Giai đoạn 1 của mạch vòng kín vật tư: nối phiếu vật tư ↔ điểm thay thế ↔ SYC,
-- và mở chỗ chứa số liệu THỰC TẾ cho lịch sử thay thế.
--
-- Toàn bộ là ADDITIVE. Không đụng vào cột nào đang có, không xoá gì.
-- KHÔNG dùng `npm run db:push` cho file này: DB dev/prod còn bảng ngoài schema từ nhánh khác,
-- push sẽ đòi xoá chúng. Áp bằng:
--   npx prisma db execute --file prisma/manual/add-vong-kin-vat-tu.sql --schema prisma/schema.prisma

-- 1) Bảng nối phiếu vật tư ↔ điểm thay thế -----------------------------------------------
CREATE TABLE IF NOT EXISTS "MaterialTicketReplacement" (
  "id"              TEXT NOT NULL,
  "ticketId"        TEXT NOT NULL,
  "replacementId"   TEXT NOT NULL,
  "plannedQuantity" INTEGER,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaterialTicketReplacement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MaterialTicketReplacement_ticketId_replacementId_key"
  ON "MaterialTicketReplacement" ("ticketId", "replacementId");
CREATE INDEX IF NOT EXISTS "MaterialTicketReplacement_replacementId_idx"
  ON "MaterialTicketReplacement" ("replacementId");

-- Khoá ngoại tách riêng để chạy lại file không lỗi "constraint đã tồn tại".
DO $$ BEGIN
  ALTER TABLE "MaterialTicketReplacement"
    ADD CONSTRAINT "MaterialTicketReplacement_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "MaterialTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MaterialTicketReplacement"
    ADD CONSTRAINT "MaterialTicketReplacement_replacementId_fkey"
    FOREIGN KEY ("replacementId") REFERENCES "MaterialReplacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Phiếu vật tư → SYC ------------------------------------------------------------------
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "defectId" TEXT;
CREATE INDEX IF NOT EXISTS "MaterialTicket_defectId_idx" ON "MaterialTicket" ("defectId");

DO $$ BEGIN
  ALTER TABLE "MaterialTicket"
    ADD CONSTRAINT "MaterialTicket_defectId_fkey"
    FOREIGN KEY ("defectId") REFERENCES "Defect"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Điểm thay thế: cờ gia hạn -----------------------------------------------------------
ALTER TABLE "MaterialReplacement" ADD COLUMN IF NOT EXISTS "renewalAppliedAt" TIMESTAMP(3);
ALTER TABLE "MaterialReplacement" ADD COLUMN IF NOT EXISTS "autoRenew" BOOLEAN NOT NULL DEFAULT true;

-- 4) Lịch sử thay thế: số liệu thực tế + chứng từ ----------------------------------------
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "ticketId" TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "usedQuantity" INTEGER;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "bbntDoNumber" TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "bbntDoUrl" TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "proposalNumber" TEXT;
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "deliveryNoteNumber" TEXT;
-- Có trong nhóm cột lưu trữ của một số môi trường, nhưng giai đoạn 3 cũng bắt buộc dùng
-- để chụp số PCT/LCT khi quyết toán; khai báo lại IF NOT EXISTS để script này tự đủ.
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "pctNumber" TEXT;

CREATE INDEX IF NOT EXISTS "MaterialReplacementLog_ticketId_idx"
  ON "MaterialReplacementLog" ("ticketId");

-- Khoá idempotent của giai đoạn 3: một phiếu ghi đúng một dòng cho mỗi điểm.
-- Dòng cũ (do SYC hoặc nhập tay) có ticketId = NULL; Postgres coi mỗi NULL là khác nhau nên
-- ràng buộc này KHÔNG đụng tới dữ liệu đang có.
CREATE UNIQUE INDEX IF NOT EXISTS "MaterialReplacementLog_replacementId_ticketId_key"
  ON "MaterialReplacementLog" ("replacementId", "ticketId");

-- 5) Phân biệt dòng lịch sử PHÁT SINH ngoài lịch với dòng định kỳ ------------------------
-- Không suy được từ `replacementId IS NULL`: dòng định kỳ cũng rơi vào null khi điểm đã hết
-- chu kỳ đang theo dõi tại lúc quyết toán.
ALTER TABLE "MaterialReplacementLog" ADD COLUMN IF NOT EXISTS "unplanned" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "MaterialReplacementLog_unplanned_replacedAt_idx"
  ON "MaterialReplacementLog" ("unplanned", "replacedAt" DESC);
