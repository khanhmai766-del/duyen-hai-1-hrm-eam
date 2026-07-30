-- Bảng đọc một chiều các mẫu dầu Không Đạt đồng bộ từ LIMS.
-- Script an toàn để chạy nhiều lần và không tác động các bảng khác.

BEGIN;

CREATE TABLE IF NOT EXISTS "oil_analysis_failures" (
  "id" TEXT NOT NULL,
  "limsId" TEXT NOT NULL,
  "soPhieu" TEXT NOT NULL,
  "khuVuc" TEXT NOT NULL,
  "donVi" TEXT NOT NULL,
  "tenMau" TEXT NOT NULL,
  "ngayLayMau" TIMESTAMP(3),
  "danhGia" TEXT,
  "ykienPkt" TEXT,
  "ykienQlvh" TEXT,
  "ngayTraKq" TIMESTAMP(3),
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "oil_analysis_failures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "oil_analysis_failures_limsId_key"
  ON "oil_analysis_failures"("limsId");

CREATE INDEX IF NOT EXISTS "oil_analysis_failures_khuVuc_donVi_idx"
  ON "oil_analysis_failures"("khuVuc", "donVi");

CREATE INDEX IF NOT EXISTS "oil_analysis_failures_ngayTraKq_idx"
  ON "oil_analysis_failures"("ngayTraKq");

COMMIT;
