-- Nhóm nhân sự nhà thầu: SCTX / Đại tu (07/10/2026). PCT nhà thầu chỉ nhận CHTT và nhân viên đúng nhóm.
-- Chạm dữ liệu thật: lần ĐẦU thêm cột thì gán nhóm ban đầu theo nguồn hồ sơ —
--   đồng bộ từ Google Sheets thẻ ra vào cổng (sheetSyncedAt có giá trị) → OVERHAUL, còn lại (nhập tay / thêm nhanh) → SCTX.
-- Chạy lại không gán đè nhóm đã chỉnh tay vì khối gán nằm trong nhánh "cột chưa có".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'WorkPermitPerson' AND column_name = 'scope'
  ) THEN
    ALTER TABLE "WorkPermitPerson" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'SCTX';
    UPDATE "WorkPermitPerson" SET "scope" = 'OVERHAUL' WHERE "sheetSyncedAt" IS NOT NULL;
  END IF;
END $$;
