-- Bổ sung STT cố định cho phiếu vật tư hiện có và các phiếu tạo mới.
-- SERIAL tự điền giá trị cho các dòng cũ, tạo sequence và default nextval.
ALTER TABLE "MaterialTicket"
ADD COLUMN IF NOT EXISTS "sequenceNumber" SERIAL;

CREATE UNIQUE INDEX IF NOT EXISTS "MaterialTicket_sequenceNumber_key"
ON "MaterialTicket"("sequenceNumber");
