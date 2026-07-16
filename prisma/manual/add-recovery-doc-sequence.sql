-- Số văn bản Biên bản vật tư thu hồi: bảng đếm theo năm + số đã cấp trên phiếu.
CREATE TABLE IF NOT EXISTS "RecoveryDocSequence" (
  "year"  INTEGER NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "RecoveryDocSequence_pkey" PRIMARY KEY ("year")
);
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "recoveryDocNo" INTEGER;
ALTER TABLE "MaterialTicket" ADD COLUMN IF NOT EXISTS "recoveryDocNoYear" INTEGER;
