-- Ca được admin chỉ định; NULL tiếp tục tự chia. Không thay đổi lịch sử/kết quả cũ.
ALTER TABLE "grounding_lightning_items" ADD COLUMN IF NOT EXISTS "assignedShift" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grounding_lightning_items_assignedShift_check') THEN
    ALTER TABLE "grounding_lightning_items" ADD CONSTRAINT "grounding_lightning_items_assignedShift_check"
      CHECK ("assignedShift" IS NULL OR "assignedShift" IN ('MORNING', 'AFTERNOON', 'NIGHT'));
  END IF;
END $$;
