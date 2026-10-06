-- Phân loại đơn vị nhà thầu theo nhóm PCT (06/10/2026): SCTX / Đại tu / cả hai.
-- Chỉ THÊM cột, mặc định false = "Chưa phân loại" → hành vi y như trước (chọn được ở cả hai nhóm).
-- Chạy lại vô hại. Gợi ý phân loại sẵn: scripts/data-ops/suggest-company-scopes.ts (xem trước rồi --commit).
ALTER TABLE "WorkPermitCompany" ADD COLUMN IF NOT EXISTS "sctx" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkPermitCompany" ADD COLUMN IF NOT EXISTS "overhaul" BOOLEAN NOT NULL DEFAULT false;
