-- Số nhân viên đơn vị công tác ghi mục 1.3 mẫu PCT giấy Điện (10/10/2026). Thuần additive, chạy lại an toàn.
ALTER TABLE "WorkPermit" ADD COLUMN IF NOT EXISTS "printWorkerCount" INTEGER;
