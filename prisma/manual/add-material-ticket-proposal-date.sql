-- Ngày ghi trên phiếu Đề xuất vật tư (ĐXVT) giấy.
--
-- KHÁC `proposalIssuedAt`: cột đó là mốc Thống kê thao tác trên hệ thống, còn cột này là
-- ngày in trên tờ phiếu. BBNT D-Office có sẵn ô "Phiếu đề xuất vật tư số … ngày ……" nên
-- thiếu ngày là biên bản in ra hụt một nửa căn cứ.
--
-- Thuần additive và idempotent. Áp bằng:
--   npx prisma db execute --file prisma/manual/add-material-ticket-proposal-date.sql --schema prisma/schema.prisma
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "proposalDate" TIMESTAMP(3);
