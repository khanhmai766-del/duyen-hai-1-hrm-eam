-- Kho tài liệu cho trợ lý AI tra cứu (RAG). Không cần pgvector: vector lưu DOUBLE PRECISION[],
-- so khớp trong Node (xem lib/ai-knowledge.ts). Viết theo kiểu IF NOT EXISTS để chạy lại không hỏng.

CREATE TABLE IF NOT EXISTS "AiKnowledgeDocument" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "sourcePath" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "publicUrl" TEXT,
  "contentHash" TEXT NOT NULL,
  "embeddingModel" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiKnowledgeDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiKnowledgeDocument_sourcePath_key" ON "AiKnowledgeDocument"("sourcePath");
CREATE INDEX IF NOT EXISTS "AiKnowledgeDocument_category_idx" ON "AiKnowledgeDocument"("category");

CREATE TABLE IF NOT EXISTS "AiKnowledgeChunk" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "heading" TEXT,
  "content" TEXT NOT NULL,
  "embedding" DOUBLE PRECISION[],
  CONSTRAINT "AiKnowledgeChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiKnowledgeChunk_documentId_chunkIndex_key" ON "AiKnowledgeChunk"("documentId", "chunkIndex");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiKnowledgeChunk_documentId_fkey') THEN
    ALTER TABLE "AiKnowledgeChunk"
      ADD CONSTRAINT "AiKnowledgeChunk_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES "AiKnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
