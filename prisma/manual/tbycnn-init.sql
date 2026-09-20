-- TBYCNN — tạo 2 bảng sổ Thiết bị yêu cầu nghiêm ngặt về ATLĐ.
-- Trích từ `prisma migrate diff` và LỌC LẠI chỉ phần tbycnn_* — DB dev còn bảng
-- ngoài schema của nhánh khác nên KHÔNG chạy `db:push` (sẽ đòi drop các bảng đó).
--   npx prisma db execute --file prisma/sql/tbycnn-init.sql --schema prisma/schema.prisma

-- CreateTable
CREATE TABLE IF NOT EXISTS "tbycnn_periods" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "monthNo" INTEGER NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbycnn_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "tbycnn_equipments" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "sourceId" INTEGER,
    "khuVuc" TEXT NOT NULL,
    "cuongVi" TEXT,
    "cuongViCode" TEXT,
    "machine" TEXT NOT NULL DEFAULT 'COMMON',
    "nhom" TEXT NOT NULL,
    "nhomSo" INTEGER,
    "danhMuc" TEXT NOT NULL,
    "tt" INTEGER,
    "tenThietBi" TEXT NOT NULL,
    "soLuong" INTEGER,
    "maHieu" TEXT,
    "kks" TEXT,
    "thongSoKyThuat" TEXT,
    "viTri" TEXT,
    "chucDanhQuanLy" TEXT,
    "donViQuanLy" TEXT,
    "chuKyThu" DOUBLE PRECISION,
    "kdGanNhat" TIMESTAMP(3),
    "kdGanNhatText" TEXT,
    "soBbkd" TEXT,
    "donViKd" TEXT,
    "kdTiepTheo" TIMESTAMP(3),
    "kdTiepTheoText" TEXT,
    "soLuongKhaDung" INTEGER,
    "soLuongKhongKhaDung" INTEGER,
    "khiemKhuyet" TEXT,
    "ghiChu" TEXT,
    "deviceSeq" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbycnn_equipments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tbycnn_periods_label_key" ON "tbycnn_periods"("label");

CREATE INDEX IF NOT EXISTS "tbycnn_periods_isClosed_idx" ON "tbycnn_periods"("isClosed");

CREATE UNIQUE INDEX IF NOT EXISTS "tbycnn_periods_year_monthNo_key" ON "tbycnn_periods"("year", "monthNo");

CREATE INDEX IF NOT EXISTS "tbycnn_equipments_periodId_khuVuc_idx" ON "tbycnn_equipments"("periodId", "khuVuc");

CREATE INDEX IF NOT EXISTS "tbycnn_equipments_periodId_cuongViCode_idx" ON "tbycnn_equipments"("periodId", "cuongViCode");

CREATE INDEX IF NOT EXISTS "tbycnn_equipments_periodId_danhMuc_idx" ON "tbycnn_equipments"("periodId", "danhMuc");

CREATE INDEX IF NOT EXISTS "tbycnn_equipments_periodId_kdTiepTheo_idx" ON "tbycnn_equipments"("periodId", "kdTiepTheo");

CREATE UNIQUE INDEX IF NOT EXISTS "tbycnn_equipments_periodId_sourceId_key" ON "tbycnn_equipments"("periodId", "sourceId");

-- AddForeignKey
ALTER TABLE "tbycnn_equipments" ADD CONSTRAINT "tbycnn_equipments_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "tbycnn_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

