-- Chỉ bổ sung cấu trúc để giữ mục tổng đã tách; không sửa/xoá dữ liệu thiết bị.
ALTER TABLE "grounding_lightning_items" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "grounding_lightning_items" ADD COLUMN IF NOT EXISTS "splitFromId" TEXT;
CREATE INDEX IF NOT EXISTS "grounding_lightning_items_splitFromId_idx" ON "grounding_lightning_items"("splitFromId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grounding_lightning_items_splitFromId_fkey') THEN
    ALTER TABLE "grounding_lightning_items" ADD CONSTRAINT "grounding_lightning_items_splitFromId_fkey"
      FOREIGN KEY ("splitFromId") REFERENCES "grounding_lightning_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
