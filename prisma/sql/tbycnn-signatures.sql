-- TBYCNN — bảng chữ ký xác nhận cho từng dòng thiết bị.
-- Trích từ `prisma migrate diff` và LỌC LẠI chỉ phần tbycnn_signatures (xem
-- prisma/sql/tbycnn-init.sql để biết vì sao không dùng db:push).
--   npx prisma db execute --file prisma/sql/tbycnn-signatures.sql --schema prisma/schema.prisma

-- CreateTable
CREATE TABLE IF NOT EXISTS "tbycnn_signatures" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerPosition" TEXT,
    "signature_key" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbycnn_signatures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tbycnn_signatures_equipmentId_key" ON "tbycnn_signatures"("equipmentId");
CREATE INDEX IF NOT EXISTS "tbycnn_signatures_periodId_idx" ON "tbycnn_signatures"("periodId");
CREATE INDEX IF NOT EXISTS "tbycnn_signatures_userId_idx" ON "tbycnn_signatures"("userId");

ALTER TABLE "tbycnn_signatures" ADD CONSTRAINT "tbycnn_signatures_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "tbycnn_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tbycnn_signatures" ADD CONSTRAINT "tbycnn_signatures_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "tbycnn_equipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
