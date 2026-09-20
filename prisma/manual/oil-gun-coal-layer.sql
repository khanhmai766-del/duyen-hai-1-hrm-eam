-- Hướng A: thêm lớp dữ liệu vòi than (dùng CHUNG vị trí với vòi dầu).
-- Tất cả cột thêm mới đều có DEFAULT hoặc cho NULL → migration cộng thêm, an toàn,
-- không khoá bảng lâu, không mất dữ liệu. forceFlame đã có sẵn nên KHÔNG thêm lại.
-- Idempotent — chạy lại an toàn.
--   npx prisma db execute --file scripts/sql/oil-gun-coal-layer.sql --schema prisma/schema.prisma

ALTER TABLE "OilGun"
  ADD COLUMN IF NOT EXISTS "coalStatus"     TEXT NOT NULL DEFAULT 'available', -- vòi than mặc định khả dụng → "xanh" ngay
  ADD COLUMN IF NOT EXISTS "coalDefectNote" TEXT,
  ADD COLUMN IF NOT EXISTS "coalUpdatedBy"  TEXT,
  ADD COLUMN IF NOT EXISTS "coalUpdatedAt"  TIMESTAMP(3);
