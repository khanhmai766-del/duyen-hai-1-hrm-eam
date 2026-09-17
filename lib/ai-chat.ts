import { prisma } from "@/lib/prisma";
import { verifyAiCitationProof } from "@/lib/ai-auth";

export const AI_CHAT_RETENTION_DAYS = 14;
/**
 * Số liệu chất lượng sống lâu hơn hội thoại (14 ngày) vì dùng để so tháng này với tháng trước.
 * Bảng chỉ có số, không có nội dung câu hỏi (xem `AiTurnLog` trong prisma/schema.prisma).
 */
export const AI_TURN_LOG_RETENTION_DAYS = 180;
export const AI_CHAT_MAX_QUESTION_LENGTH = 2_000;
export const AI_CHAT_HISTORY_LIMIT = 10;

export type AiCitation = {
  sourceType:
    | "DEVICE" | "DEFECT" | "DEFECT_HISTORY" | "REPAIR" | "MATERIAL_REPLACEMENT" | "ANNOUNCEMENT" | "SHIFT" | "DOCUMENT"
    | "WORK_PERMIT" | "PCCC" | "TBYCNN" | "GROUNDING" | "MATERIAL" | "ERP_MATERIAL" | "MATERIAL_TICKET"
    | "MATERIAL_PLAN" | "CHEMICAL" | "ARCHIVE";
  sourceId: string;
  title: string;
  url: string;
  occurredAt?: string | null;
};

/**
 * TRANG NGƯỜI DÙNG ĐANG ĐỨNG khi đặt câu hỏi. Gửi kèm sang n8n để mô hình không phải đoán
 * "thiết bị này" là thiết bị nào — nhờ đó bớt hẳn một lượt gọi công cụ "Tìm thiết bị".
 */
export type AiPageContext = {
  path: string;
  entityType?: AiCitation["sourceType"];
  entityId?: string;
  label?: string;
};

export function aiConversationExpiry(from = new Date()) {
  return new Date(from.getTime() + AI_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

const ALLOWED_CITATION_TYPES = new Set<AiCitation["sourceType"]>([
  "DEVICE", "DEFECT", "DEFECT_HISTORY", "REPAIR", "MATERIAL_REPLACEMENT", "ANNOUNCEMENT", "SHIFT", "DOCUMENT",
  "WORK_PERMIT", "PCCC", "TBYCNN", "GROUNDING", "MATERIAL", "ERP_MATERIAL", "MATERIAL_TICKET", "MATERIAL_PLAN",
  "CHEMICAL", "ARCHIVE",
]);
const ALLOWED_CITATION_PATHS = /^\/(devices|defects|repair-history|replacement-history|notifications|hr|tai-lieu|work-permits|pccc|tbycnn|grounding-lightning|materials|vat-tu\/loai-dau|replacement-procedures|material-annual-plans|chemical-inventory|documents\/archive)(\/|\?|$)/;

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

/**
 * Chuẩn hoá ngữ cảnh trang do TRÌNH DUYỆT gửi lên — coi như dữ liệu người dùng nhập, không
 * tin được: chỉ nhận đường dẫn NỘI BỘ (một dấu "/" đầu, không phải "//host") và loại thực thể
 * nằm trong danh sách cho phép. Nhãn bị cắt ngắn vì đi thẳng vào ngữ cảnh của mô hình.
 */
export function sanitizeAiPageContext(raw: unknown): AiPageContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const path = String(input.path ?? "").trim().slice(0, 300);
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  const entityType = String(input.entityType ?? "") as AiCitation["sourceType"];
  const entityId = String(input.entityId ?? "").trim().slice(0, 200);
  const label = String(input.label ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  return {
    path,
    ...(ALLOWED_CITATION_TYPES.has(entityType) ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(label ? { label } : {}),
  };
}

/** Đường dẫn để GHI SỐ LIỆU: bỏ query và hash để không lưu từ khoá tìm kiếm của người dùng. */
export function aiPagePathForLog(page: AiPageContext | null) {
  return page ? page.path.split(/[?#]/)[0]!.slice(0, 200) : null;
}

export function cleanupExpiredAiConversations() {
  void prisma.aiConversation.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch((error) => {
    console.error("[ai chat cleanup]", error);
  });
}

export function cleanupExpiredAiTurnLogs() {
  const before = new Date(Date.now() - AI_TURN_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return prisma.aiTurnLog.deleteMany({ where: { createdAt: { lt: before } } });
}
