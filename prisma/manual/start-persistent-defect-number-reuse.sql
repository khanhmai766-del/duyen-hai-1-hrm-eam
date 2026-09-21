-- Mốc bắt đầu chính sách giữ STT hủy sớm trong kho cho tới khi được tái cấp.
-- Các STT đã trả trước lúc chạy file này (bao gồm 2275/2026) không được đưa vào kho.
-- Chạy lại an toàn: COALESCE giữ nguyên mốc của lần áp dụng đầu tiên.
ALTER TABLE "DefectSyncSetting"
ADD COLUMN IF NOT EXISTS "requestNumberReuseCutoverAt" TIMESTAMP(3);

INSERT INTO "DefectSyncSetting" (
  "id",
  "requestNumberReuseCutoverAt",
  "updatedAt"
)
VALUES ('singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE
SET "requestNumberReuseCutoverAt" = COALESCE(
  "DefectSyncSetting"."requestNumberReuseCutoverAt",
  EXCLUDED."requestNumberReuseCutoverAt"
);

ALTER TABLE "DefectSyncSetting"
ALTER COLUMN "requestNumberReuseCutoverAt" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "requestNumberReuseCutoverAt" SET NOT NULL;
