import { prisma } from "@/lib/prisma";
import { verifyAiCitationProof } from "@/lib/ai-auth";

export const AI_CHAT_RETENTION_DAYS = 14;
export const AI_CHAT_MAX_QUESTION_LENGTH = 2_000;
export const AI_CHAT_HISTORY_LIMIT = 10;

export type AiCitation = {
  sourceType: "DEVICE" | "DEFECT" | "DEFECT_HISTORY" | "REPAIR" | "MATERIAL_REPLACEMENT";
  sourceId: string;
  title: string;
  url: string;
  occurredAt?: string | null;
};

export function aiConversationExpiry(from = new Date()) {
  return new Date(from.getTime() + AI_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

const ALLOWED_CITATION_TYPES = new Set<AiCitation["sourceType"]>([
  "DEVICE", "DEFECT", "DEFECT_HISTORY", "REPAIR", "MATERIAL_REPLACEMENT",
]);
const ALLOWED_CITATION_PATHS = /^\/(devices|defects|repair-history|replacement-history)(\/|\?|$)/;

/**
 * Chuẩn hoá MỘT nguồn trích dẫn: đúng loại, có id + tiêu đề, và chỉ trỏ vào đường dẫn NỘI BỘ
 * đã cho phép. Dùng chung cho nguồn website tự gom (lib/ai-request-registry.ts) lẫn nguồn
 * kiểu cũ do mô hình kể lại (`sanitizeAiCitations`, còn kiểm thêm chữ ký).
 */
export function normalizeAiCitation(raw: unknown): AiCitation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const sourceType = String(item.sourceType ?? "") as AiCitation["sourceType"];
  const sourceId = String(item.sourceId ?? "").trim().slice(0, 200);
  const title = String(item.title ?? "").trim().slice(0, 300);
  const url = String(item.url ?? "").trim().slice(0, 500);
  if (!ALLOWED_CITATION_TYPES.has(sourceType) || !sourceId || !title || !ALLOWED_CITATION_PATHS.test(url)) return null;
  return { sourceType, sourceId, title, url, occurredAt: item.occurredAt ? String(item.occurredAt) : null };
}

/** Nguồn kiểu cũ do mô hình chép lại kèm `proof` — chỉ nhận nguồn có chữ ký hợp lệ. */
export function sanitizeAiCitations(value: unknown, conversationId: string): AiCitation[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((raw) => {
    const citation = normalizeAiCitation(raw);
    if (!citation) return [];
    const proof = String((raw as Record<string, unknown>).proof ?? "").trim();
    const key = `${citation.sourceType}:${citation.sourceId}`;
    if (seen.has(key) || !verifyAiCitationProof(conversationId, { ...citation, proof })) return [];
    seen.add(key);
    return [citation];
  }).slice(0, 20);
}

export function cleanupExpiredAiConversations() {
  void prisma.aiConversation.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch((error) => {
    console.error("[ai chat cleanup]", error);
  });
}
