-- SĐT liên hệ của nhân sự nhà thầu (23/09/2026). Cột additive, dữ liệu cũ nhận chuỗi rỗng.
ALTER TABLE "WorkPermitPerson" ADD COLUMN IF NOT EXISTS "phone" TEXT NOT NULL DEFAULT '';
