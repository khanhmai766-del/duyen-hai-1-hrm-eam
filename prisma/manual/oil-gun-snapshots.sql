-- Ảnh chụp sơ đồ vòi đốt theo ngày (xem lại trạng thái ngày cũ). Chỉ tạo bảng mới, chạy lại an toàn.
CREATE TABLE IF NOT EXISTS "OilGunSnapshot" (
  "id"            TEXT         NOT NULL,
  "machine"       TEXT         NOT NULL,
  "date"          TEXT         NOT NULL,
  "guns"          JSONB        NOT NULL,
  "note"          TEXT         NOT NULL DEFAULT '',
  "noteUpdatedBy" TEXT,
  "noteUpdatedAt" TIMESTAMP(3),
  "capturedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OilGunSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OilGunSnapshot_machine_date_key" ON "OilGunSnapshot"("machine", "date");
