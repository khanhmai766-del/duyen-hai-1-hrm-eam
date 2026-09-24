-- =====================================================================
-- Sơ đồ khiếm khuyết vòi thổi bụi (Thư mục lưu trữ > Vòi thổi bụi).
-- Tạo 2 bảng mới SootBlower và SootBlowerDefect, khớp prisma/schema.prisma.
-- Chỉ thêm bảng/index, không chạm dữ liệu cũ; chạy lại nhiều lần không hỏng.
--
--   npx prisma db execute --file prisma/manual/add-soot-blowers.sql --schema prisma/schema.prisma
-- =====================================================================

CREATE TABLE IF NOT EXISTS "SootBlower" (
  "id"        TEXT         NOT NULL,
  "machine"   TEXT         NOT NULL,
  "tag"       TEXT         NOT NULL,
  "status"    TEXT         NOT NULL DEFAULT 'available',
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SootBlower_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SootBlower_machine_tag_key" ON "SootBlower"("machine", "tag");

CREATE TABLE IF NOT EXISTS "SootBlowerDefect" (
  "id"          TEXT         NOT NULL,
  "machine"     TEXT         NOT NULL,
  "tag"         TEXT         NOT NULL,
  "dept"        TEXT         NOT NULL,
  "description" TEXT         NOT NULL,
  "reportedBy"  TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"  TIMESTAMP(3),
  "resolvedBy"  TEXT,
  CONSTRAINT "SootBlowerDefect_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SootBlowerDefect_machine_tag_idx" ON "SootBlowerDefect"("machine", "tag");
CREATE INDEX IF NOT EXISTS "SootBlowerDefect_machine_resolvedAt_idx" ON "SootBlowerDefect"("machine", "resolvedAt");
