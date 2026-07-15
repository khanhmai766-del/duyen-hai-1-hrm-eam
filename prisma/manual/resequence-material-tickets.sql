BEGIN;

LOCK TABLE "MaterialTicket" IN EXCLUSIVE MODE;

-- Mã VT-<năm>-xxxx không còn dùng trong nghiệp vụ.
ALTER TABLE "MaterialTicket"
DROP COLUMN IF EXISTS "code";

-- Gắn khóa tháng theo giờ Việt Nam cho dữ liệu hiện có.
ALTER TABLE "MaterialTicket"
ADD COLUMN IF NOT EXISTS "sequenceMonth" TEXT;

UPDATE "MaterialTicket"
SET "sequenceMonth" = TO_CHAR(
  "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh',
  'YYYY-MM'
)
WHERE "sequenceMonth" IS NULL OR "sequenceMonth" = '';

ALTER TABLE "MaterialTicket"
ALTER COLUMN "sequenceMonth" SET NOT NULL;

-- Bỏ cơ chế STT tự tăng/unique toàn cục cũ.
DROP INDEX IF EXISTS "MaterialTicket_sequenceNumber_key";
DROP INDEX IF EXISTS "MaterialTicket_sequenceMonth_sequenceNumber_key";

ALTER TABLE "MaterialTicket"
ALTER COLUMN "sequenceNumber" DROP DEFAULT;

DROP SEQUENCE IF EXISTS "MaterialTicket_sequenceNumber_seq";

-- Đánh lại STT riêng trong từng tháng, giữ nguyên thứ tự tạo phiếu.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "sequenceMonth"
      ORDER BY "createdAt" ASC, id ASC
    )::INTEGER AS "nextSequenceNumber"
  FROM "MaterialTicket"
)
UPDATE "MaterialTicket" AS ticket
SET "sequenceNumber" = ranked."nextSequenceNumber"
FROM ranked
WHERE ticket.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS "MaterialTicket_sequenceMonth_sequenceNumber_key"
ON "MaterialTicket"("sequenceMonth", "sequenceNumber");

COMMIT;
