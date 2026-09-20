-- Module PCCC: chỉ TẠO MỚI, không đụng bảng nào đang có.
-- KHÔNG dùng `prisma db push` trên DB này: schema và DB đang lệch pha sẵn từ trước
-- (db push sẽ DROP 9 bảng ShiftSchedule*/Rotation*/Staffing* đang tồn tại trong DB).
-- Chạy: npx prisma db execute --file scripts/sql/pccc_init.sql --schema prisma/schema.prisma

-- CreateTable
CREATE TABLE "pccc_periods" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "monthNo" INTEGER NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pccc_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pccc_extinguishers" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "stt" DOUBLE PRECISION,
    "ma" TEXT NOT NULL,
    "chungLoai" TEXT,
    "viTri" TEXT,
    "cuongVi" TEXT,
    "nguoiGiamSat" TEXT,
    "sl" DOUBLE PRECISION,
    "dvt" TEXT,
    "tinhTrang" TEXT,
    "apSuat" TEXT,
    "viTriHienTai" TEXT,
    "tinhTrangNgoai" TEXT,
    "nguonGoc" TEXT,
    "thoiGianThayGanNhat" TIMESTAMP(3),
    "ngaySx" TIMESTAMP(3),
    "thoiGianSd" DOUBLE PRECISION,
    "denHanThayThe" TIMESTAMP(3),
    "ngayKiemTra" TIMESTAMP(3),
    "nguoiKiemTra" TEXT,
    "ghiChu" TEXT,
    "deviceSeq" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pccc_extinguishers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pccc_cabinets" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "stt" DOUBLE PRECISION,
    "ma" TEXT NOT NULL,
    "ten" TEXT,
    "viTri" TEXT,
    "cuongVi" TEXT,
    "sl" DOUBLE PRECISION,
    "dvt" TEXT,
    "soYcsc" TEXT,
    "ngayKiemTra" TIMESTAMP(3),
    "nguoiKiemTra" TEXT,
    "ghiChu" TEXT,
    "tinhTrangTongThe" TEXT,
    "deviceSeq" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pccc_cabinets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pccc_cabinet_components" (
    "id" TEXT NOT NULL,
    "cabinetId" TEXT NOT NULL,
    "groupLabel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "groupOrder" INTEGER NOT NULL,
    "statusOrder" INTEGER NOT NULL,

    CONSTRAINT "pccc_cabinet_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pccc_bulks" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "stt" DOUBLE PRECISION,
    "ten" TEXT NOT NULL,
    "cuongVi" TEXT,
    "viTri" TEXT,
    "dvt" TEXT,
    "khoiLuongThietKe" DOUBLE PRECISION,
    "khoiLuongHienTai" DOUBLE PRECISION,
    "phanTramConLai" DOUBLE PRECISION,
    "tinhTrang" TEXT,
    "ngayChot" TIMESTAMP(3),
    "nguoiChot" TEXT,
    "ghiChu" TEXT,
    "deviceSeq" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pccc_bulks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pccc_fm200_panels" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "panelKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "binhLabels" TEXT[],
    "cuongVi" TEXT,
    "mucMin" DOUBLE PRECISION,
    "mucMax" DOUBLE PRECISION,
    "mucDvt" TEXT,
    "mucValues" JSONB NOT NULL,
    "mucGhiChu" TEXT,
    "apMin" DOUBLE PRECISION,
    "apMax" DOUBLE PRECISION,
    "apDvt" TEXT,
    "apValues" JSONB NOT NULL,
    "apGhiChu" TEXT,
    "ngayKiemTra" TIMESTAMP(3),
    "nguoiKiemTra" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pccc_fm200_panels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pccc_signatures" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerPosition" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pccc_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pccc_periods_label_key" ON "pccc_periods"("label");

-- CreateIndex
CREATE INDEX "pccc_periods_isClosed_idx" ON "pccc_periods"("isClosed");

-- CreateIndex
CREATE UNIQUE INDEX "pccc_periods_year_monthNo_key" ON "pccc_periods"("year", "monthNo");

-- CreateIndex
CREATE INDEX "pccc_extinguishers_periodId_cuongVi_idx" ON "pccc_extinguishers"("periodId", "cuongVi");

-- CreateIndex
CREATE INDEX "pccc_extinguishers_periodId_tinhTrang_idx" ON "pccc_extinguishers"("periodId", "tinhTrang");

-- CreateIndex
CREATE INDEX "pccc_extinguishers_periodId_chungLoai_idx" ON "pccc_extinguishers"("periodId", "chungLoai");

-- CreateIndex
CREATE INDEX "pccc_extinguishers_deviceSeq_idx" ON "pccc_extinguishers"("deviceSeq");

-- CreateIndex
CREATE UNIQUE INDEX "pccc_extinguishers_periodId_ma_key" ON "pccc_extinguishers"("periodId", "ma");

-- CreateIndex
CREATE INDEX "pccc_cabinets_periodId_cuongVi_idx" ON "pccc_cabinets"("periodId", "cuongVi");

-- CreateIndex
CREATE INDEX "pccc_cabinets_periodId_tinhTrangTongThe_idx" ON "pccc_cabinets"("periodId", "tinhTrangTongThe");

-- CreateIndex
CREATE INDEX "pccc_cabinets_deviceSeq_idx" ON "pccc_cabinets"("deviceSeq");

-- CreateIndex
CREATE UNIQUE INDEX "pccc_cabinets_periodId_ma_key" ON "pccc_cabinets"("periodId", "ma");

-- CreateIndex
CREATE INDEX "pccc_cabinet_components_cabinetId_idx" ON "pccc_cabinet_components"("cabinetId");

-- CreateIndex
CREATE UNIQUE INDEX "pccc_cabinet_components_cabinetId_groupLabel_status_key" ON "pccc_cabinet_components"("cabinetId", "groupLabel", "status");

-- CreateIndex
CREATE INDEX "pccc_bulks_periodId_cuongVi_idx" ON "pccc_bulks"("periodId", "cuongVi");

-- CreateIndex
CREATE UNIQUE INDEX "pccc_bulks_periodId_ten_key" ON "pccc_bulks"("periodId", "ten");

-- CreateIndex
CREATE UNIQUE INDEX "pccc_fm200_panels_periodId_panelKey_key" ON "pccc_fm200_panels"("periodId", "panelKey");

-- CreateIndex
CREATE INDEX "pccc_signatures_periodId_targetType_idx" ON "pccc_signatures"("periodId", "targetType");

-- CreateIndex
CREATE INDEX "pccc_signatures_userId_idx" ON "pccc_signatures"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "pccc_signatures_targetType_targetId_key" ON "pccc_signatures"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "pccc_extinguishers" ADD CONSTRAINT "pccc_extinguishers_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "pccc_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pccc_cabinets" ADD CONSTRAINT "pccc_cabinets_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "pccc_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pccc_cabinet_components" ADD CONSTRAINT "pccc_cabinet_components_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "pccc_cabinets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pccc_bulks" ADD CONSTRAINT "pccc_bulks_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "pccc_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pccc_fm200_panels" ADD CONSTRAINT "pccc_fm200_panels_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "pccc_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pccc_signatures" ADD CONSTRAINT "pccc_signatures_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "pccc_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
