-- =====================================================================
-- PCCC ĐỢT 2 — nút nhấn báo cháy, van chữa cháy, đèn EXIT / đèn chiếu
-- sáng sự cố, cuộn vòi chữa cháy.
-- =====================================================================
-- An toàn: mọi câu đều IF NOT EXISTS → đã có thì bỏ qua, chưa có thì tạo.
-- KHÔNG drop, KHÔNG sửa kiểu, KHÔNG đụng dữ liệu hiện có.
--
-- Cách chạy trên production (DATABASE_URL trỏ DB thật):
--   npx prisma db execute --file prisma/manual/add-pccc-round2-tables.sql --schema prisma/schema.prisma
--
-- TUYỆT ĐỐI KHÔNG dùng `prisma db push` trên production.
-- =====================================================================

-- ---------------------------------------------------------------- NNBC
CREATE TABLE IF NOT EXISTS "pccc_alarm_buttons" (
  "id"               TEXT NOT NULL,
  "periodId"         TEXT NOT NULL,
  "rowKey"           TEXT NOT NULL,
  "stt"              DOUBLE PRECISION,
  "maKks"            TEXT NOT NULL,
  "tenKhuVuc"        TEXT,
  "viTri"            TEXT,
  "cuongVi"          TEXT,
  "cuongViCode"      TEXT,
  "machine"          TEXT NOT NULL DEFAULT 'COMMON',
  "nguoiGiamSat"     TEXT,
  "nguoiGiamSatCode" TEXT,
  "khac"             TEXT,
  "ngayKiemTra"      TIMESTAMP(3),
  "nguoiKiemTra"     TEXT,
  "tinhTrangTongThe" TEXT,
  "deviceSeq"        TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pccc_alarm_buttons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pccc_alarm_buttons_periodId_rowKey_key" ON "pccc_alarm_buttons" ("periodId", "rowKey");
CREATE INDEX IF NOT EXISTS "pccc_alarm_buttons_periodId_cuongViCode_idx"      ON "pccc_alarm_buttons" ("periodId", "cuongViCode");
CREATE INDEX IF NOT EXISTS "pccc_alarm_buttons_periodId_machine_idx"          ON "pccc_alarm_buttons" ("periodId", "machine");
CREATE INDEX IF NOT EXISTS "pccc_alarm_buttons_periodId_tinhTrangTongThe_idx" ON "pccc_alarm_buttons" ("periodId", "tinhTrangTongThe");
CREATE INDEX IF NOT EXISTS "pccc_alarm_buttons_periodId_maKks_idx"            ON "pccc_alarm_buttons" ("periodId", "maKks");
CREATE INDEX IF NOT EXISTS "pccc_alarm_buttons_deviceSeq_idx"                 ON "pccc_alarm_buttons" ("deviceSeq");

DO $$ BEGIN
  ALTER TABLE "pccc_alarm_buttons"
    ADD CONSTRAINT "pccc_alarm_buttons_periodId_fkey"
    FOREIGN KEY ("periodId") REFERENCES "pccc_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "pccc_alarm_button_components" (
  "id"          TEXT NOT NULL,
  "buttonId"    TEXT NOT NULL,
  "groupLabel"  TEXT NOT NULL,
  "status"      TEXT NOT NULL,
  "checked"     BOOLEAN NOT NULL DEFAULT false,
  "groupOrder"  INTEGER NOT NULL,
  "statusOrder" INTEGER NOT NULL,
  CONSTRAINT "pccc_alarm_button_components_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pccc_alarm_button_components_buttonId_groupLabel_status_key" ON "pccc_alarm_button_components" ("buttonId", "groupLabel", "status");
CREATE INDEX IF NOT EXISTS "pccc_alarm_button_components_buttonId_idx" ON "pccc_alarm_button_components" ("buttonId");

DO $$ BEGIN
  ALTER TABLE "pccc_alarm_button_components"
    ADD CONSTRAINT "pccc_alarm_button_components_buttonId_fkey"
    FOREIGN KEY ("buttonId") REFERENCES "pccc_alarm_buttons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------- VAN CHỮA CHÁY
CREATE TABLE IF NOT EXISTS "pccc_valves" (
  "id"               TEXT NOT NULL,
  "periodId"         TEXT NOT NULL,
  "rowKey"           TEXT NOT NULL,
  "stt"              DOUBLE PRECISION,
  "tenVan"           TEXT NOT NULL,
  "loaiVan"          TEXT NOT NULL,
  "maKks"            TEXT NOT NULL,
  "cuongVi"          TEXT,
  "cuongViCode"      TEXT,
  "machine"          TEXT NOT NULL DEFAULT 'COMMON',
  "nguoiGiamSat"     TEXT,
  "nguoiGiamSatCode" TEXT,
  "viTri"            TEXT,
  "tinhTrang"        TEXT,
  "moTa"             TEXT,
  "soYcsc"           TEXT,
  "ngayKiemTra"      TIMESTAMP(3),
  "nguoiKiemTra"     TEXT,
  "deviceSeq"        TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pccc_valves_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pccc_valves_periodId_rowKey_key" ON "pccc_valves" ("periodId", "rowKey");
CREATE INDEX IF NOT EXISTS "pccc_valves_periodId_cuongViCode_idx" ON "pccc_valves" ("periodId", "cuongViCode");
CREATE INDEX IF NOT EXISTS "pccc_valves_periodId_machine_idx"     ON "pccc_valves" ("periodId", "machine");
CREATE INDEX IF NOT EXISTS "pccc_valves_periodId_tinhTrang_idx"   ON "pccc_valves" ("periodId", "tinhTrang");
CREATE INDEX IF NOT EXISTS "pccc_valves_periodId_loaiVan_idx"     ON "pccc_valves" ("periodId", "loaiVan");
CREATE INDEX IF NOT EXISTS "pccc_valves_deviceSeq_idx"            ON "pccc_valves" ("deviceSeq");

DO $$ BEGIN
  ALTER TABLE "pccc_valves"
    ADD CONSTRAINT "pccc_valves_periodId_fkey"
    FOREIGN KEY ("periodId") REFERENCES "pccc_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------- ĐÈN EXIT + ĐÈN CHIẾU SÁNG SỰ CỐ
CREATE TABLE IF NOT EXISTS "pccc_emergency_lights" (
  "id"               TEXT NOT NULL,
  "periodId"         TEXT NOT NULL,
  "loai"             TEXT NOT NULL,
  "rowKey"           TEXT NOT NULL,
  "stt"              DOUBLE PRECISION,
  "maKks"            TEXT NOT NULL,
  "tenKhuVuc"        TEXT,
  "maBanVe"          TEXT,
  "soLuongKhuVuc"    DOUBLE PRECISION,
  "cuongVi"          TEXT,
  "cuongViCode"      TEXT,
  "machine"          TEXT NOT NULL DEFAULT 'COMMON',
  "nguoiGiamSat"     TEXT,
  "nguoiGiamSatCode" TEXT,
  "tinhTrang"        TEXT,
  "ketQuaTest"       TEXT,
  "ghiChu"           TEXT,
  "ngayKiemTra"      TIMESTAMP(3),
  "nguoiKiemTra"     TEXT,
  "deviceSeq"        TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pccc_emergency_lights_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pccc_emergency_lights_periodId_loai_rowKey_key" ON "pccc_emergency_lights" ("periodId", "loai", "rowKey");
CREATE INDEX IF NOT EXISTS "pccc_emergency_lights_periodId_loai_cuongViCode_idx" ON "pccc_emergency_lights" ("periodId", "loai", "cuongViCode");
CREATE INDEX IF NOT EXISTS "pccc_emergency_lights_periodId_loai_machine_idx"     ON "pccc_emergency_lights" ("periodId", "loai", "machine");
CREATE INDEX IF NOT EXISTS "pccc_emergency_lights_periodId_loai_tinhTrang_idx"   ON "pccc_emergency_lights" ("periodId", "loai", "tinhTrang");
CREATE INDEX IF NOT EXISTS "pccc_emergency_lights_periodId_maKks_idx"            ON "pccc_emergency_lights" ("periodId", "maKks");
CREATE INDEX IF NOT EXISTS "pccc_emergency_lights_deviceSeq_idx"                 ON "pccc_emergency_lights" ("deviceSeq");

DO $$ BEGIN
  ALTER TABLE "pccc_emergency_lights"
    ADD CONSTRAINT "pccc_emergency_lights_periodId_fkey"
    FOREIGN KEY ("periodId") REFERENCES "pccc_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------- CUỘN VÒI CHỮA CHÁY
CREATE TABLE IF NOT EXISTS "pccc_hose_reels" (
  "id"               TEXT NOT NULL,
  "periodId"         TEXT NOT NULL,
  "cabinetId"        TEXT NOT NULL,
  "stt"              DOUBLE PRECISION,
  "ma"               TEXT NOT NULL,
  "ten"              TEXT,
  "viTri"            TEXT,
  "cuongVi"          TEXT,
  "cuongViCode"      TEXT,
  "machine"          TEXT NOT NULL DEFAULT 'COMMON',
  "soYcsc"           TEXT,
  "ngayKiemTra"      TIMESTAMP(3),
  "nguoiKiemTra"     TEXT,
  "ghiChu"           TEXT,
  "tinhTrangTongThe" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pccc_hose_reels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pccc_hose_reels_periodId_ma_key" ON "pccc_hose_reels" ("periodId", "ma");
CREATE INDEX IF NOT EXISTS "pccc_hose_reels_periodId_cuongViCode_idx" ON "pccc_hose_reels" ("periodId", "cuongViCode");
CREATE INDEX IF NOT EXISTS "pccc_hose_reels_periodId_machine_idx"     ON "pccc_hose_reels" ("periodId", "machine");
CREATE INDEX IF NOT EXISTS "pccc_hose_reels_cabinetId_idx"            ON "pccc_hose_reels" ("cabinetId");

DO $$ BEGIN
  ALTER TABLE "pccc_hose_reels"
    ADD CONSTRAINT "pccc_hose_reels_periodId_fkey"
    FOREIGN KEY ("periodId") REFERENCES "pccc_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pccc_hose_reels"
    ADD CONSTRAINT "pccc_hose_reels_cabinetId_fkey"
    FOREIGN KEY ("cabinetId") REFERENCES "pccc_cabinets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "pccc_hose_reel_components" (
  "id"          TEXT NOT NULL,
  "reelId"      TEXT NOT NULL,
  "groupLabel"  TEXT NOT NULL,
  "status"      TEXT NOT NULL,
  "checked"     BOOLEAN NOT NULL DEFAULT false,
  "groupOrder"  INTEGER NOT NULL,
  "statusOrder" INTEGER NOT NULL,
  CONSTRAINT "pccc_hose_reel_components_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pccc_hose_reel_components_reelId_groupLabel_status_key" ON "pccc_hose_reel_components" ("reelId", "groupLabel", "status");
CREATE INDEX IF NOT EXISTS "pccc_hose_reel_components_reelId_idx" ON "pccc_hose_reel_components" ("reelId");

DO $$ BEGIN
  ALTER TABLE "pccc_hose_reel_components"
    ADD CONSTRAINT "pccc_hose_reel_components_reelId_fkey"
    FOREIGN KEY ("reelId") REFERENCES "pccc_hose_reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
