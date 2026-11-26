-- Cài đặt phân tích độ rung (tham số, mức nền theo thiết bị, phiếu ngoài danh mục đã lưu). Viết IF NOT EXISTS để chạy lại không hỏng.
CREATE TABLE IF NOT EXISTS "VibrationAnalysisMeta" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById" TEXT,
  "updatedByName" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "VibrationAnalysisMeta_pkey" PRIMARY KEY ("key")
);
