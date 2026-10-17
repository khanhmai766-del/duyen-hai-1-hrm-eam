import { createHash } from "node:crypto";
import {
  AI_KNOWLEDGE_CHUNKER_VERSION,
  cleanExtractedPdfText,
  chunkKnowledgeText,
} from "@/lib/ai-knowledge";
import { AI_EMBEDDING_DIMENSIONS, AI_EMBEDDING_MODEL } from "@/lib/ai-embedding";

export const DOCUMENT_AI_INDEX_PIPELINE_VERSION = 1;
export const MAX_DOCUMENT_PDF_BYTES = 25 * 1024 * 1024;

/** Lỗi hết hạn mức Gemini (gói miễn phí) — thử lại từ ngày hôm sau, khi hạn mức ngày đã hồi. */
export function isDocumentAiQuotaError(error: string | null | undefined) {
  return /429|quota|RESOURCE_EXHAUSTED/i.test(error ?? "");
}
/**
 * Công tắc tạm dừng nạp PDF vào kho AI (`DOCUMENT_AI_INDEX_PAUSED=1` trong .env): danh sách gửi n8n báo mọi tài liệu
 * "không cần nạp" và route lập chỉ mục từ chối mà KHÔNG ghi lỗi. Dừng phía web vì tắt workflow bằng CLI n8n phải restart
 * cả n8n (17/10/2026: gói Gemini miễn phí hết hạn mức, user bảo ngừng nạp). Đồng bộ Drive không bị ảnh hưởng.
 */
export function isDocumentAiIndexPaused() {
  return process.env.DOCUMENT_AI_INDEX_PAUSED?.trim() === "1";
}

/** Lỗi khác (PDF rỗng / quét không đọc được / quá lớn / quá thời gian…) chờ 3 ngày rồi mới thử lại. */
export const DOCUMENT_AI_RETRY_DAYS = 3;

/**
 * Lúc được thử nạp lại một tài liệu đang LỖI (nghiệp vụ 11/10/2026, gói Gemini miễn phí): hết hạn mức → 0 giờ (giờ VN) ngày
 * hôm sau lần thử; lỗi khác → sau 3 ngày. null = không phải chờ (chưa lỗi, hoặc dữ liệu cũ chưa ghi lúc thử).
 * Danh sách gửi n8n ẩn tài liệu đang chờ, để MỘT tài liệu hỏng không chặn cả hàng (từng kẹt PCT NH3 05–11/10/2026).
 */
export function aiIndexRetryAt(input: { aiIndexError?: string | null; aiIndexAttemptedAt?: Date | string | null; driveModifiedAt?: Date | string | null }) {
  if (!input.aiIndexError || !input.aiIndexAttemptedAt) return null;
  const attempted = new Date(input.aiIndexAttemptedAt).getTime();
  if (!Number.isFinite(attempted)) return null;
  // File trên Drive đổi SAU lần thử lỗi (tải lại PDF đúng thay file hỏng, vd file 245 NH3 rỗng) → nạp lại ngay, không chờ.
  const modified = input.driveModifiedAt ? new Date(input.driveModifiedAt).getTime() : NaN;
  if (Number.isFinite(modified) && modified > attempted) return null;
  if (!isDocumentAiQuotaError(input.aiIndexError)) return new Date(attempted + DOCUMENT_AI_RETRY_DAYS * 86_400_000);
  const vnDay = Math.floor((attempted + 7 * 3_600_000) / 86_400_000);
  return new Date((vnDay + 1) * 86_400_000 - 7 * 3_600_000);
}

export function documentAiSourcePath(documentId: string) {
  return `digital-document:${documentId}`;
}

export function buildDocumentAiIndexVersion(input: {
  driveChecksum?: string | null;
  driveModifiedAt?: Date | string | null;
}) {
  const sourceVersion = String(input.driveChecksum ?? "").trim()
    || (input.driveModifiedAt ? new Date(input.driveModifiedAt).toISOString() : "unknown");
  return [
    `pipeline-${DOCUMENT_AI_INDEX_PIPELINE_VERSION}`,
    `chunker-${AI_KNOWLEDGE_CHUNKER_VERSION}`,
    AI_EMBEDDING_MODEL,
    AI_EMBEDDING_DIMENSIONS,
    sourceVersion,
  ].join(":");
}

export function prepareDocumentAiContent(rawText: string, title: string) {
  const content = cleanExtractedPdfText(rawText);
  const chunks = chunkKnowledgeText(content);
  const contentHash = createHash("sha256")
    .update(JSON.stringify({
      content,
      title,
      category: "quy-trinh",
      model: AI_EMBEDDING_MODEL,
      dimensions: AI_EMBEDDING_DIMENSIONS,
      chunker: AI_KNOWLEDGE_CHUNKER_VERSION,
      pipeline: DOCUMENT_AI_INDEX_PIPELINE_VERSION,
    }))
    .digest("hex");
  return { content, chunks, contentHash };
}

export function needsDocumentAiIndex(current: string | null | undefined, desired: string) {
  return !current || current !== desired;
}
