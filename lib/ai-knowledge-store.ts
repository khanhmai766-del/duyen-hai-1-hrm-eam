import { prisma } from "@/lib/prisma";
import { hasAssignedPermissionLevel } from "@/lib/rbac-permissions";
import {
  AI_KNOWLEDGE_CATEGORIES,
  aiKnowledgePermissionId,
  type AiKnowledgeCategory,
  type AiKnowledgeSearchChunk,
} from "@/lib/ai-knowledge";

/**
 * Toàn bộ đoạn tài liệu kèm vector, giữ trong bộ nhớ tiến trình. Kho chỉ vài trăm đoạn (~2 MB kể cả
 * vector) nên tải hết một lần rẻ hơn truy vấn mỗi câu hỏi. Script nạp chạy ở tiến trình khác nên
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

const VIEW_LEVELS = ["read", "personal", "manage", "full"] as const;

/** Nhóm tài liệu người dùng được đọc — tính lại từ ma trận quyền mỗi lần, không tin mô hình gửi. */
export async function allowedAiKnowledgeCategories(user: { id?: string; role?: string }) {
  const categories = Object.keys(AI_KNOWLEDGE_CATEGORIES) as AiKnowledgeCategory[];
  const allowed = await Promise.all(
    categories.map((category) => hasAssignedPermissionLevel(user, aiKnowledgePermissionId(category), [...VIEW_LEVELS]))
  );
  return categories.filter((_, index) => allowed[index]);
}
