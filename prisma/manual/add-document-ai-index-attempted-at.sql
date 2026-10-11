-- Lần gần nhất n8n gửi PDF để nạp AI (11/10/2026) — tính thời gian chờ thử lại, để một tài liệu lỗi không chặn cả hàng.
ALTER TABLE "DigitalDocument" ADD COLUMN IF NOT EXISTS "aiIndexAttemptedAt" TIMESTAMP(3);
