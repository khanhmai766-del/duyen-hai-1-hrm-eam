-- Ghi chú chung cho sơ đồ vòi dầu theo tổ máy (S1/S2).
-- Idempotent — chạy lại an toàn.
--   npx prisma db execute --file scripts/sql/oil-gun-note.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "OilGunNote" (
  machine TEXT PRIMARY KEY,
  note TEXT NOT NULL DEFAULT '',
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
