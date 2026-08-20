-- Kho Vật tư khác: additive, không đổi/xoá dữ liệu hoặc liên kết vật tư hiện hữu.

ALTER TABLE "MaterialTicketItem"
  ADD COLUMN IF NOT EXISTS "receivedQuantity" INTEGER;

CREATE TABLE IF NOT EXISTS "MaterialStockMovement" (
  "id" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "materialCode" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "stockBefore" INTEGER NOT NULL,
  "stockAfter" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "ticketId" TEXT,
  "ticketItemId" TEXT,
  "assignedPosition" TEXT,
  "unit" TEXT,
  "deviceSeq" TEXT,
  "receiverId" TEXT,
  "receiverName" TEXT,
  "issuerId" TEXT,
  "issuerName" TEXT,
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL,
  "createdByPosition" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaterialStockMovement_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "MaterialStockMovement"
    ADD CONSTRAINT "MaterialStockMovement_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "MaterialStockMovement_materialCode_occurredAt_idx"
  ON "MaterialStockMovement"("materialCode", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "MaterialStockMovement_materialId_occurredAt_idx"
  ON "MaterialStockMovement"("materialId", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "MaterialStockMovement_ticketId_idx"
  ON "MaterialStockMovement"("ticketId");
CREATE INDEX IF NOT EXISTS "MaterialStockMovement_type_occurredAt_idx"
  ON "MaterialStockMovement"("type", "occurredAt" DESC);
