const ERRORS = {
  AI_PROVIDER_UNAVAILABLE: {
    status: 503,
    message: "Dịch vụ AI đang quá tải hoặc tạm thời không khả dụng. Câu hỏi chưa được lưu, vui lòng thử lại sau",
  },
  AI_PROVIDER_RATE_LIMITED: {
    status: 429,
    message: "Dịch vụ AI đang giới hạn lượt xử lý. Câu hỏi chưa được lưu, vui lòng thử lại sau",
  },
  AI_WORKFLOW_FAILED: {
    status: 502,
    message: "Trợ lý AI gặp lỗi khi xử lý. Câu hỏi chưa được lưu, vui lòng thử lại sau",
  },
  AI_TIMEOUT: {
    status: 504,
    message: "Trợ lý AI xử lý quá lâu. Câu hỏi chưa được lưu, vui lòng thử lại",
  },
  AI_CONNECTION_FAILED: {
    status: 502,
    message: "Không kết nối được trợ lý AI. Câu hỏi chưa được lưu, vui lòng thử lại",
  },
  AI_EMPTY_ANSWER: {
    status: 502,
    message: "Trợ lý AI chưa tạo được câu trả lời. Câu hỏi chưa được lưu, vui lòng thử lại",
  },
  AI_INVALID_RESPONSE: {
    status: 502,
    message: "Trợ lý AI trả dữ liệu không hợp lệ. Câu hỏi chưa được lưu",
  },
  AI_BUSY: {
    status: 503,
    message: "Đang có nhiều người dùng trợ lý AI cùng lúc. Câu hỏi chưa được lưu, vui lòng thử lại sau ít phút",
  },
} as const;

export type AiErrorCode = keyof typeof ERRORS;

export function isAiErrorCode(value: unknown): value is AiErrorCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ERRORS, value);
}

export function aiError(code: AiErrorCode) {
  return { code, ...ERRORS[code] };
}

type Result =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; code: AiErrorCode; status: number; message: string };

/** Chỉ hiển thị thông báo đã định nghĩa, không chuyển tiếp lỗi thô/token từ n8n. */
export function decodeAiWebhookResponse(raw: string, httpStatus: number): Result {
  let payload: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    // Một proxy hoặc workflow bị dừng có thể trả HTML hoặc body rỗng.
  }
  const knownCode = isAiErrorCode(payload?.code) ? payload.code : null;
  if (httpStatus < 200 || httpStatus >= 300 || knownCode || payload?.error) {
    const code: AiErrorCode = knownCode ?? (httpStatus === 503
      ? "AI_PROVIDER_UNAVAILABLE"
      : httpStatus === 429 ? "AI_PROVIDER_RATE_LIMITED" : "AI_WORKFLOW_FAILED");
    return { ok: false, ...aiError(code) };
  }
  if (!payload) return { ok: false, ...aiError("AI_INVALID_RESPONSE") };
  return { ok: true, payload };
}

/**
 * Phân loại mô tả lỗi THÔ của nhà cung cấp (Gemini/Groq) thành mã an toàn. Chuỗi thô có thể
 * chứa chi tiết nội bộ nên chỉ dùng để phân loại, không bao giờ hiển thị hay ghi log nguyên văn.
 */
export function classifyAiProviderError(details: string): AiErrorCode {
  if (/\b503\b|high demand|service unavailable|overloaded|\bUNAVAILABLE\b/i.test(details)) return "AI_PROVIDER_UNAVAILABLE";
  if (/\b429\b|resource[_ ]exhausted|too many requests|rate.?limit|quota/i.test(details)) return "AI_PROVIDER_RATE_LIMITED";
  return "AI_WORKFLOW_FAILED";
}

export type N8nStreamChunk = {
  type: "begin" | "item" | "end" | "error" | "keepalive";
  content?: string;
  nodeName?: string;
};

const STREAM_CHUNK_TYPES = new Set(["begin", "item", "end", "error", "keepalive"]);

/**
 * Đọc MỘT dòng của webhook n8n ở chế độ "streaming" (application/json-lines):
 * `{"type":"begin"|"item"|"end"|"error","content":"…","metadata":{"nodeName":…}}` và
 * `{"type":"keepalive"}` mỗi 30 giây. Dòng không đúng dạng đó trả `null` — có thể là body JSON
 * kiểu cũ (responseMode "responseNode") mà website vẫn phải hiểu được.
 */
export function parseN8nStreamLine(line: string): N8nStreamChunk | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (typeof record.type !== "string" || !STREAM_CHUNK_TYPES.has(record.type)) return null;
  const metadata = record.metadata as Record<string, unknown> | undefined;
  return {
    type: record.type as N8nStreamChunk["type"],
    content: typeof record.content === "string" ? record.content : undefined,
    nodeName: typeof metadata?.nodeName === "string" ? metadata.nodeName : undefined,
  };
}

/**
 * Nút "Trả lỗi về website" của workflow phát đúng một mẩu item chứa `{"code":…,"error":…}`.
 * Nhận ra mẩu đó để báo lỗi thay vì hiện chuỗi JSON như thể là câu trả lời.
 */
export function errorCodeFromStreamItem(content: string): AiErrorCode | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") || !trimmed.includes("\"code\"")) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown> | null;
    return isAiErrorCode(parsed?.code) ? parsed.code : null;
  } catch {
    return null;
  }
}
