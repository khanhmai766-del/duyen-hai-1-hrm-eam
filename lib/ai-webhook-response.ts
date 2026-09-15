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
} as const;

type Result =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; status: number; message: string };

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
  const code = typeof payload?.code === "string" ? payload.code : "";
  const knownError = Object.prototype.hasOwnProperty.call(ERRORS, code)
    ? ERRORS[code as keyof typeof ERRORS]
    : null;
  if (httpStatus < 200 || httpStatus >= 300 || knownError || payload?.error) {
    const error = knownError ?? (httpStatus === 503
      ? ERRORS.AI_PROVIDER_UNAVAILABLE
      : httpStatus === 429 ? ERRORS.AI_PROVIDER_RATE_LIMITED : ERRORS.AI_WORKFLOW_FAILED);
    return { ok: false, ...error };
  }
  if (!payload) {
    return { ok: false, status: 502, message: "Trợ lý AI trả dữ liệu không hợp lệ. Câu hỏi chưa được lưu" };
  }
  return { ok: true, payload };
}
