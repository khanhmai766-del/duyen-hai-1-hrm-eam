CREATE TABLE "MaterialTicketSyncDeletion" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "syncKey" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialTicketSyncDeletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaterialTicketSyncDeletion_syncKey_key"
ON "MaterialTicketSyncDeletion"("syncKey");

CREATE INDEX "MaterialTicketSyncDeletion_deletedAt_id_idx"
ON "MaterialTicketSyncDeletion"("deletedAt", "id");

CREATE INDEX "MaterialTicketSyncDeletion_ticketId_idx"
ON "MaterialTicketSyncDeletion"("ticketId");
