-- Cột pgvector cho kho tài liệu chatbox (AiKnowledgeChunk) — tìm đoạn liên quan ngay trong Postgres
-- thay vì tải toàn bộ vector (~56 MB, 5.754 đoạn lúc 17/10/2026) vào RAM mỗi tiến trình web.
--
-- - "embeddingVec" vector(768) là BẢN SAO của cột "embedding" (Float[] vẫn là nguồn, Prisma vẫn ghi
--   vào đó). Trigger tự chép mỗi lần INSERT/UPDATE nên route nạp PDF và script ai:knowledge-ingest
--   không cần sửa.
-- - Cột KHÔNG khai báo trong schema.prisma vì DB dev (embedded) không có pgvector. Đừng `db push`
--   lên production — nó sẽ xoá cột này (production vốn chỉ áp SQL tay).
-- - Không tạo chỉ mục HNSW: vài nghìn đoạn thì quét tuần tự chỉ vài mili giây và cho kết quả CHÍNH
--   XÁC như cách cũ. Chỉ cân nhắc HNSW khi kho vượt ~50.000 đoạn.
-- - Máy không có pgvector (DB dev) thì cả file bỏ qua, code tự quay về so cosine trong Node.
--
-- Chạm dữ liệu: UPDATE điền "embeddingVec" cho mọi dòng AiKnowledgeChunk (chỉ cột mới, không đổi
-- dữ liệu cũ). Idempotent.

DO $outer$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    RAISE NOTICE 'Máy này không có pgvector — bỏ qua, chatbox dùng cosine trong Node';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS vector;

  EXECUTE 'ALTER TABLE "AiKnowledgeChunk" ADD COLUMN IF NOT EXISTS "embeddingVec" vector(768)';

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION "aiKnowledgeChunkSyncVec"() RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      NEW."embeddingVec" := CASE WHEN array_length(NEW."embedding", 1) = 768 THEN NEW."embedding"::vector(768) END;
      RETURN NEW;
    END
    $body$
  $fn$;

  EXECUTE 'CREATE OR REPLACE TRIGGER "AiKnowledgeChunk_syncVec"
             BEFORE INSERT OR UPDATE OF "embedding" ON "AiKnowledgeChunk"
             FOR EACH ROW EXECUTE FUNCTION "aiKnowledgeChunkSyncVec"()';

  EXECUTE 'UPDATE "AiKnowledgeChunk"
              SET "embeddingVec" = "embedding"::vector(768)
            WHERE "embeddingVec" IS NULL AND array_length("embedding", 1) = 768';
END
$outer$;
