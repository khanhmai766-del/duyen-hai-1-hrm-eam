-- TÁCH DÃY STT PHIẾU VẬT TƯ: mỗi tháng có hai dãy chạy song song, đánh số độc lập từ 1.
--
--   MATERIAL  vật tư thông thường
--   CHEMICAL  hóa chất (HOA_CHAT) + NH3 lỏng khai một bước (GHI_NHAN)
--
-- Chạy TRƯỚC `prisma generate`. Dùng SQL riêng chứ không `db push` vì cơ sở dữ liệu còn
-- những bảng ngoài schema của nhánh này — `db push` sẽ đòi xoá chúng.
--
-- Chạy lại lần hai KHÔNG đổi gì thêm: cột thêm bằng IF NOT EXISTS, và bước đánh lại số
-- xếp theo (scope, createdAt, id) nên lần chạy sau cho ra đúng dãy số của lần đầu.
--
-- LƯU Ý: bước đánh lại số ĐỔI STT của phiếu cũ. Xuất bảng đối chiếu trước bằng
-- scripts/report-material-ticket-sequence-remap.ts rồi hãy chạy tệp này.

-- 1. Cột phạm vi dãy -------------------------------------------------------------------
ALTER TABLE "MaterialTicket"
  ADD COLUMN IF NOT EXISTS "sequenceScope" TEXT NOT NULL DEFAULT 'MATERIAL';

-- 2. Phân loại dữ liệu cũ --------------------------------------------------------------
-- Xét CẢ `type` lẫn `materialCategory`: `type` là căn cứ chính (được chốt lúc tạo), còn
-- materialCategory là lưới an toàn cho phiếu cũ nếu có bản ghi nào lệch.
UPDATE "MaterialTicket"
SET "sequenceScope" = 'CHEMICAL'
WHERE "type" IN ('HOA_CHAT', 'GHI_NHAN') OR "materialCategory" = 'Hóa chất';

UPDATE "MaterialTicket"
SET "sequenceScope" = 'MATERIAL'
WHERE "type" NOT IN ('HOA_CHAT', 'GHI_NHAN')
  AND ("materialCategory" IS DISTINCT FROM 'Hóa chất');

-- 3. Gỡ khóa cũ trước khi đánh lại số ---------------------------------------------------
-- Phải gỡ TRƯỚC: trong lúc đánh lại, hai phiếu khác dãy sẽ tạm thời cùng (tháng, STT).
--
-- Gỡ CẢ HAI dạng: Prisma hiện thực `@@unique` bằng UNIQUE INDEX chứ không phải table
-- constraint, nên chỉ `DROP CONSTRAINT` là không gỡ được gì mà cũng không báo lỗi — khóa
-- cũ ở lại và mọi lần tạo phiếu hóa chất sau đó đều chết vì trùng (tháng, STT).
ALTER TABLE "MaterialTicket" DROP CONSTRAINT IF EXISTS "MaterialTicket_sequenceMonth_sequenceNumber_key";
DROP INDEX IF EXISTS "MaterialTicket_sequenceMonth_sequenceNumber_key";

-- 4. Đánh lại số theo từng (tháng, dãy) -------------------------------------------------
-- Đảo dấu trước rồi mới ghi số dương: khóa duy nhất mới được tạo ở bước 5, nhưng làm vậy
-- cũng tránh va chạm nếu ai đó chạy tệp này khi khóa đã tồn tại.
UPDATE "MaterialTicket" SET "sequenceNumber" = -"sequenceNumber" WHERE "sequenceNumber" > 0;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "sequenceMonth", "sequenceScope"
      ORDER BY "createdAt" ASC, id ASC
    )::INTEGER AS "nextSequenceNumber"
  FROM "MaterialTicket"
)
UPDATE "MaterialTicket" AS ticket
SET "sequenceNumber" = ranked."nextSequenceNumber"
FROM ranked
WHERE ticket.id = ranked.id;

-- 5. Khóa duy nhất + chỉ mục mới --------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "MaterialTicket_sequenceMonth_sequenceScope_sequenceNumber_key"
  ON "MaterialTicket" ("sequenceMonth", "sequenceScope", "sequenceNumber");
CREATE INDEX IF NOT EXISTS "MaterialTicket_sequenceMonth_sequenceScope_idx"
  ON "MaterialTicket" ("sequenceMonth", "sequenceScope");

-- 6. Buộc phạm vi luôn khớp loại phiếu --------------------------------------------------
-- Bất biến giữ cho khóa duy nhất không vỡ: đổi `type` sau khi tạo là phiếu đổi dãy, mà
-- STT của dãy mới thì đã có phiếu khác giữ. Ràng buộc này biến lỗi âm thầm thành lỗi ồn.
ALTER TABLE "MaterialTicket" DROP CONSTRAINT IF EXISTS "MaterialTicket_sequenceScope_matches_type";
ALTER TABLE "MaterialTicket" ADD CONSTRAINT "MaterialTicket_sequenceScope_matches_type" CHECK (
  "sequenceScope" = CASE WHEN "type" IN ('HOA_CHAT', 'GHI_NHAN') THEN 'CHEMICAL' ELSE 'MATERIAL' END
);
