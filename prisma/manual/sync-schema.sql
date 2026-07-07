-- =====================================================================
-- ĐỒNG BỘ SCHEMA AN TOÀN (chỉ THÊM, KHÔNG BAO GIỜ XOÁ)
-- =====================================================================
-- Vì sao cần: commit "perf(api): stop running schema DDL on every request"
-- đã gỡ cơ chế "tự tạo bảng" (ensure*) khỏi mỗi request. Trước khi deploy bản
-- đó, DB phải có sẵn các bảng/cột dưới đây.
--
-- An toàn: mọi câu đều IF NOT EXISTS → đã có thì bỏ qua, chưa có thì tạo.
-- KHÔNG drop, KHÔNG sửa kiểu, KHÔNG đụng dữ liệu hiện có.
--
-- Cách chạy trên production (DATABASE_URL trỏ DB thật):
--   npx prisma db execute --file prisma/manual/sync-schema.sql --schema prisma/schema.prisma
-- Hoặc bằng psql:
--   psql "$DATABASE_URL" -f prisma/manual/sync-schema.sql
--
-- TUYỆT ĐỐI KHÔNG dùng `prisma db push` trên production (có thể drop bảng
-- ngoài-schema → mất dữ liệu).
-- =====================================================================

-- Announcement: cột mệnh lệnh / tệp đính kèm / vòng đời
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'BULLETIN';
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "classification" TEXT;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "stt" TEXT;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "orderedBy" TEXT;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3);
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "invalidatedAt" TIMESTAMP(3);
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "linkUrl" TEXT;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "fileUrl" TEXT;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "fileName" TEXT;

CREATE TABLE IF NOT EXISTS "AnnouncementRead" (
  id TEXT PRIMARY KEY,
  "announcementId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AnnouncementRead_announcementId_userId_key"
  ON "AnnouncementRead" ("announcementId", "userId");

-- Defect: cột ảnh hưởng PCCC / môi trường
ALTER TABLE "Defect" ADD COLUMN IF NOT EXISTS "fireSafetyImpact" TEXT;
ALTER TABLE "Defect" ADD COLUMN IF NOT EXISTS "environmentSafetyImpact" TEXT;

-- SystemBroadcast
CREATE TABLE IF NOT EXISTS "SystemBroadcast" (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RbacConfig
CREATE TABLE IF NOT EXISTS "RbacConfig" (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- DigitalDocument + index + các cột bổ sung
CREATE TABLE IF NOT EXISTS "DigitalDocument" (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  "decisionNumber" TEXT,
  "issueDate" TIMESTAMP(3),
  "documentUrl" TEXT NOT NULL,
  "managingPosition" TEXT,
  "managementBlock" TEXT,
  "procedureType" TEXT,
  "reason" TEXT,
  "progress" TEXT,
  "note" TEXT,
  "attachmentUrls" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DigitalDocument_category_updatedAt_idx"
  ON "DigitalDocument" (category, "updatedAt" DESC);
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "managingPosition" TEXT;
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "issueDate" TIMESTAMP(3);
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "managementBlock" TEXT;
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "procedureType" TEXT;
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "reason" TEXT;
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "progress" TEXT;
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "attachmentUrls" TEXT;

-- PositionSystemScope + index + cột access
CREATE TABLE IF NOT EXISTS "PositionSystemScope" (
  "id" TEXT NOT NULL,
  "position" TEXT NOT NULL,
  "systemSeq" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PositionSystemScope_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PositionSystemScope_position_systemSeq_key"
  ON "PositionSystemScope" ("position", "systemSeq");
CREATE INDEX IF NOT EXISTS "PositionSystemScope_position_idx"
  ON "PositionSystemScope" ("position");
CREATE INDEX IF NOT EXISTS "PositionSystemScope_systemSeq_idx"
  ON "PositionSystemScope" ("systemSeq");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'PositionSystemScope' AND column_name = 'access'
  ) THEN
    ALTER TABLE "PositionSystemScope" ADD COLUMN "access" TEXT NOT NULL DEFAULT 'view';
    UPDATE "PositionSystemScope" SET "access" = 'edit';
  END IF;
END $$;

-- TimesheetOverride (model mới thêm vào schema)
CREATE TABLE IF NOT EXISTS "TimesheetOverride" (
  "userId" TEXT NOT NULL,
  date TEXT NOT NULL,
  value TEXT NOT NULL,
  note TEXT,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", date)
);

-- OilGun (dữ liệu vòi dầu buồng đốt — 36 vòi/tổ máy). Sau khi tạo bảng phải chạy
-- seed: `node prisma/seed-oil-guns.mjs` để nạp 36 vòi cho S1 và S2.
CREATE TABLE IF NOT EXISTS "OilGun" (
  id TEXT PRIMARY KEY,
  machine TEXT NOT NULL,
  code TEXT NOT NULL,
  wall TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available',
  defect TEXT,
  "defectSccn" TEXT,
  "defectScd" TEXT,
  "forceFlame" BOOLEAN NOT NULL DEFAULT false,
  "coalStatus" TEXT NOT NULL DEFAULT 'available',
  "coalDefectNote" TEXT,
  "coalUpdatedBy" TEXT,
  "coalUpdatedAt" TIMESTAMP(3),
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "OilGun_machine_code_key" ON "OilGun" (machine, code);
CREATE INDEX IF NOT EXISTS "OilGun_machine_idx" ON "OilGun" (machine);

CREATE TABLE IF NOT EXISTS "OilGunNote" (
  machine TEXT PRIMARY KEY,
  note TEXT NOT NULL DEFAULT '',
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
