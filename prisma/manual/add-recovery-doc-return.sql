-- BƯỚC "TRẢ PHIẾU VẬT TƯ THU HỒI" — bản chỉnh 10/09/2026.
--
-- Đổi tên bốn cột cũ (recoveryHandover*) thành chặng 1 "đã đem biên bản sang kho", thêm bốn
-- cột cho chặng 2 "kho đã ký và trả lại biên bản", và đổi mã trạng thái cho đúng nghĩa:
-- bước này theo dõi TỜ BIÊN BẢN, không phải việc trả hiện vật thu hồi.
--
-- Idempotent: kiểm tra sự tồn tại trước mỗi lệnh đổi tên.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'MaterialTicket' AND column_name = 'recoveryHandoverAt') THEN
    ALTER TABLE "MaterialTicket" RENAME COLUMN "recoveryHandoverAt" TO "recoveryDocSentAt";
    ALTER TABLE "MaterialTicket" RENAME COLUMN "recoveryHandoverById" TO "recoveryDocSentById";
    ALTER TABLE "MaterialTicket" RENAME COLUMN "recoveryHandoverByName" TO "recoveryDocSentByName";
    ALTER TABLE "MaterialTicket" RENAME COLUMN "recoveryHandoverByPosition" TO "recoveryDocSentByPosition";
  END IF;
END $$;

ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "recoveryDocSentAt" TIMESTAMP(3);
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "recoveryDocSentById" TEXT;
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "recoveryDocSentByName" TEXT;
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "recoveryDocSentByPosition" TEXT;
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "recoveryDocSignedAt" TIMESTAMP(3);
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "recoveryDocSignedById" TEXT;
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "recoveryDocSignedByName" TEXT;
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "recoveryDocSignedByPosition" TEXT;

-- Mã trạng thái cũ → mã mới. Bước nay đứng TRƯỚC quyết toán, nên phiếu ĐÃ quyết toán mà
-- đang treo ở bước này (28 phiếu mở lại hôm 10/09) vẫn giữ nguyên chỗ đứng: chặng 1 của
-- chúng sẽ đưa thẳng về HOÀN TẤT chứ không quay lại quyết toán lần hai.
UPDATE "MaterialTicket" SET "status" = 'CHO_TRA_PHIEU_THU_HOI' WHERE "status" = 'CHO_TRA_KHO_THU_HOI';
