-- Thêm cờ "Force tín hiệu ngọn lửa vòi dầu" cho OilGun.
-- Idempotent — chạy lại an toàn.
--   npx prisma db execute --file scripts/sql/oil-gun-force-flame.sql --schema prisma/schema.prisma

ALTER TABLE "OilGun" ADD COLUMN IF NOT EXISTS "forceFlame" BOOLEAN NOT NULL DEFAULT false;
