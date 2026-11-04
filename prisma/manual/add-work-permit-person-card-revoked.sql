-- Thu thẻ nhân sự nhà thầu ("Không cho phép"): người có cardRevokedAt không được tham gia PCT nào.
-- Không phá dữ liệu: chỉ thêm cột, mặc định NULL/rỗng (chưa ai bị thu thẻ).
ALTER TABLE "WorkPermitPerson" ADD COLUMN IF NOT EXISTS "cardRevokedAt" TIMESTAMP(3);
ALTER TABLE "WorkPermitPerson" ADD COLUMN IF NOT EXISTS "cardRevokedByName" TEXT NOT NULL DEFAULT '';
