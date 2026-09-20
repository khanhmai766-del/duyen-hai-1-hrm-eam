CREATE TABLE IF NOT EXISTS "pccc_fire_control_cabinets" (
  "id" TEXT NOT NULL,
  "periodId" TEXT NOT NULL,
  "stt" DOUBLE PRECISION,
  "heThong" TEXT NOT NULL,
  "ma" TEXT NOT NULL,
  "viTri" TEXT,
  "cuongVi" TEXT,
  "cuongViCode" TEXT,
  "machine" TEXT NOT NULL DEFAULT 'COMMON',
  "tinhTrang" TEXT,
  "ghiChu" TEXT,
  "ngayKiemTra" TIMESTAMP(3),
  "nguoiKiemTra" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pccc_fire_control_cabinets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pccc_fire_control_cabinets_periodId_fkey"
    FOREIGN KEY ("periodId") REFERENCES "pccc_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "pccc_fire_control_cabinets_periodId_ma_key"
  ON "pccc_fire_control_cabinets"("periodId", "ma");
CREATE INDEX IF NOT EXISTS "pccc_fire_control_cabinets_periodId_cuongViCode_idx"
  ON "pccc_fire_control_cabinets"("periodId", "cuongViCode");
CREATE INDEX IF NOT EXISTS "pccc_fire_control_cabinets_periodId_machine_idx"
  ON "pccc_fire_control_cabinets"("periodId", "machine");
CREATE INDEX IF NOT EXISTS "pccc_fire_control_cabinets_periodId_tinhTrang_idx"
  ON "pccc_fire_control_cabinets"("periodId", "tinhTrang");
CREATE INDEX IF NOT EXISTS "pccc_fire_control_cabinets_periodId_heThong_idx"
  ON "pccc_fire_control_cabinets"("periodId", "heThong");
