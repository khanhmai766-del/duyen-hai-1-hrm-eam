import { prisma } from "@/lib/prisma";
import { hasAssignedPermissionLevel } from "@/lib/rbac-permissions";
import { AI_EMBEDDING_DIMENSIONS } from "@/lib/ai-embedding";
import {
  AI_KNOWLEDGE_CATEGORIES,
  AI_KNOWLEDGE_MAX_PER_DOCUMENT,
  AI_KNOWLEDGE_MAX_RESULTS,
  AI_KNOWLEDGE_MIN_SCORE,
  aiKnowledgePermissionId,
  type AiKnowledgeCategory,
  type AiKnowledgeSearchChunk,
} from "@/lib/ai-knowledge";

/**
 * ĐƯỜNG DỰ PHÒNG khi chưa có pgvector (DB dev): toàn bộ đoạn tài liệu kèm vector, giữ trong bộ nhớ
 * tiến trình. Production dùng `searchAiKnowledgeChunksInDb` — kho đã lên hàng nghìn đoạn PDF (~56 MB)
 * nên không tải về Node nữa. Script nạp chạy ở tiến trình khác nên
 * không xoá được cache này — TTL 5 phút là độ trễ tối đa từ lúc nạp tới lúc chatbox thấy tài liệu mới.
 */
const CACHE_TTL_MS = 5 * 60_000;
const globalCache = globalThis as typeof globalThis & {
  __dh1AiKnowledge?: { expiresAt: number; promise: Promise<AiKnowledgeSearchChunk[]> };
};

async function loadChunks(): Promise<AiKnowledgeSearchChunk[]> {
  const rows = await prisma.aiKnowledgeChunk.findMany({
    select: {
      documentId: true,
      chunkIndex: true,
      heading: true,
      content: true,
      embedding: true,
      document: { select: { category: true, title: true } },
    },
  });
  return rows.map((row) => ({
    documentId: row.documentId,
    chunkIndex: row.chunkIndex,
    heading: row.heading,
    content: row.content,
    embedding: row.embedding,
    category: row.document.category,
    title: row.document.title,
  }));
}

export function getAiKnowledgeChunks() {
  const now = Date.now();
  const cached = globalCache.__dh1AiKnowledge;
  if (cached && cached.expiresAt > now) return cached.promise;
  const promise = loadChunks();
  globalCache.__dh1AiKnowledge = { expiresAt: now + CACHE_TTL_MS, promise };
  // Lỗi DB không được nằm lì trong cache 5 phút.
  promise.catch(() => {
    if (globalCache.__dh1AiKnowledge?.promise === promise) delete globalCache.__dh1AiKnowledge;
  });
  return promise;
}

export type AiKnowledgeHit = { chunk: Omit<AiKnowledgeSearchChunk, "embedding">; score: number };

/**
 * Có cột pgvector "embeddingVec" chưa (prisma/manual/add-ai-knowledge-pgvector.sql). DB dev không có
 * pgvector nên không có cột. Nhớ 5 phút để áp SQL xong thì chatbox tự chuyển, không cần reload.
 */
const globalVec = globalThis as typeof globalThis & { __dh1AiKnowledgeVec?: { expiresAt: number; ready: Promise<boolean> } };

function pgvectorReady() {
  const now = Date.now();
  const cached = globalVec.__dh1AiKnowledgeVec;
  if (cached && cached.expiresAt > now) return cached.ready;
  const ready = prisma.$queryRaw<Array<{ ready: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name = 'AiKnowledgeChunk' AND column_name = 'embeddingVec'
    ) AS ready
  `.then((rows) => Boolean(rows[0]?.ready), () => false);
  globalVec.__dh1AiKnowledgeVec = { expiresAt: now + CACHE_TTL_MS, ready };
  return ready;
}

/**
 * Xếp hạng ngay trong Postgres bằng pgvector — cùng luật với `rankKnowledgeChunks` (lọc quyền trước,
 * ngưỡng điểm, tối đa `perDocument` đoạn mỗi tài liệu) nhưng không phải tải vector về Node.
 * Trả `null` khi chưa có pgvector hoặc truy vấn lỗi để nơi gọi quay về cách cũ.
 */
export async function searchAiKnowledgeChunksInDb(
  query: number[],
  categories: string[],
  options: { limit?: number; minScore?: number; perDocument?: number } = {}
): Promise<AiKnowledgeHit[] | null> {
  const { limit = AI_KNOWLEDGE_MAX_RESULTS, minScore = AI_KNOWLEDGE_MIN_SCORE, perDocument = AI_KNOWLEDGE_MAX_PER_DOCUMENT } = options;
  if (query.length !== AI_EMBEDDING_DIMENSIONS || !(await pgvectorReady())) return null;
  const vector = `[${query.join(",")}]`;
  try {
    const rows = await prisma.$queryRaw<Array<Omit<AiKnowledgeSearchChunk, "embedding"> & { score: number }>>`
      WITH scored AS (
        SELECT c."documentId", c."chunkIndex", c."heading", c."content", d."category", d."title",
               -(c."embeddingVec" <#> ${vector}::vector) AS score
          FROM "AiKnowledgeChunk" c
          JOIN "AiKnowledgeDocument" d ON d."id" = c."documentId"
         WHERE d."category" = ANY(${categories}::text[]) AND c."embeddingVec" IS NOT NULL
      ), ranked AS (
        SELECT *, row_number() OVER (PARTITION BY "documentId" ORDER BY score DESC) AS rn
          FROM scored
         WHERE score >= ${minScore}
      )
      SELECT "documentId", "chunkIndex", "heading", "content", "category", "title", score::float8 AS score
        FROM ranked
       WHERE rn <= ${perDocument}
       ORDER BY score DESC
       LIMIT ${limit}
    `;
    return rows.map(({ score, ...chunk }) => ({ chunk, score: Number(score) }));
  } catch (error) {
    console.error("[ai-knowledge] pgvector lỗi, quay về cosine trong Node:", error instanceof Error ? error.message : error);
    delete globalVec.__dh1AiKnowledgeVec;
    return null;
  }
}

const VIEW_LEVELS = ["read", "personal", "manage", "full"] as const;

/** Nhóm tài liệu người dùng được đọc — tính lại từ ma trận quyền mỗi lần, không tin mô hình gửi. */
export async function allowedAiKnowledgeCategories(user: { id?: string; role?: string }) {
  const categories = Object.keys(AI_KNOWLEDGE_CATEGORIES) as AiKnowledgeCategory[];
  const allowed = await Promise.all(
    categories.map((category) => hasAssignedPermissionLevel(user, aiKnowledgePermissionId(category), [...VIEW_LEVELS]))
  );
  return categories.filter((_, index) => allowed[index]);
}
