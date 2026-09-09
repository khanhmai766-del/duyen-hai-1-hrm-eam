-- Ngày ghi trên phiếu giao hàng.
--
-- Cùng lý do với `proposalDate`: BBNT D-Office có sẵn ô "Phiếu giao hàng số … ngày ……",
-- thiếu ngày là biên bản in ra hụt một nửa căn cứ.
--
-- Thuần additive và idempotent. Áp bằng:
--   npx prisma db execute --file prisma/manual/add-material-ticket-delivery-note-date.sql --schema prisma/schema.prisma
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "deliveryNoteDate" TIMESTAMP(3);
