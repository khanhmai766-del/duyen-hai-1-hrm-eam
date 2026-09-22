-- Chỉ thêm cấu trúc cấp số. Không sửa số hoặc trạng thái phiếu lịch sử.
BEGIN;
CREATE TABLE IF NOT EXISTS "WorkPermitNumberBaseline" (
  "kind" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "number" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkPermitNumberBaseline_pkey" PRIMARY KEY ("kind", "year")
);

CREATE TABLE IF NOT EXISTS "WorkPermitNumberBaselineHistory" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "before" TEXT,
  "after" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkPermitNumberBaselineHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WorkPermitNumberBaselineHistory_kind_year_createdAt_idx"
  ON "WorkPermitNumberBaselineHistory" ("kind", "year", "createdAt");

CREATE TABLE IF NOT EXISTS "WorkPermitNumberReservation" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "number" TEXT NOT NULL,
  "teamType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "ownerId" TEXT NOT NULL,
  "ownerName" TEXT NOT NULL,
  "permitId" TEXT,
  "reusedPermitId" TEXT,
  "issuedAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "cancelledById" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkPermitNumberReservation_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "WorkPermitNumberReservation" ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkPermitNumberReservation_permitId_key"
  ON "WorkPermitNumberReservation" ("permitId");
CREATE INDEX IF NOT EXISTS "WorkPermitNumberReservation_kind_year_createdAt_idx"
  ON "WorkPermitNumberReservation" ("kind", "year", "createdAt");
CREATE INDEX IF NOT EXISTS "WorkPermitNumberReservation_ownerId_status_idx"
  ON "WorkPermitNumberReservation" ("ownerId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkPermitNumberReservation_active_number_key"
  ON "WorkPermitNumberReservation" ("kind", "year", "number")
  WHERE "status" IN ('RESERVED', 'ISSUED');

CREATE TABLE IF NOT EXISTS "WorkPermitNumberReservationHistory" (
  "id" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "permitId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkPermitNumberReservationHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WorkPermitNumberReservationHistory_reservationId_createdAt_idx"
  ON "WorkPermitNumberReservationHistory" ("reservationId", "createdAt");

-- Phiếu nháp cũ chưa chiếm số; chúng phải lấy số trước khi chuyển sang Đã cấp.
DROP INDEX IF EXISTS "WorkPermit_kind_year_number_key";
CREATE UNIQUE INDEX "WorkPermit_kind_year_number_key"
  ON "WorkPermit" ("kind", "year", "number")
  WHERE "status" NOT IN ('DRAFT', 'CANCELLED');
COMMIT;
