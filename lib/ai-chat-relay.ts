import {
  classifyAiProviderError,
  decodeAiWebhookResponse,
  errorCodeFromStreamItem,
  parseN8nStreamLine,
  type AiErrorCode,
} from "@/lib/ai-webhook-response";

export type AiRelayResult =
  | { ok: true; answer: string; legacyPayload: Record<string, unknown> | null }
  | { ok: false; code: AiErrorCode };

class AiIdleTimeoutError extends Error {}

/**
 * Đọc phản hồi webhook n8n và chuyển từng đoạn chữ trả lời ra ngay qua `onDelta`.
 *
 * Hiểu hai kiểu phản hồi để website và workflow không phải nâng cấp cùng lúc:
 *  - STREAMING (json-lines): ghép các mẩu `item`. Mẩu `error` KHÔNG kết thúc lượt hỏi, vì n8n
 *    phát cả lỗi của một lần gọi công cụ mà mô hình vẫn trả lời tiếp được; chỉ khi không có chữ
 *    nào, hoặc nhánh lỗi của workflow đã trả mã lỗi, mới coi là thất bại.
 *  - JSON kiểu cũ (`{answer, citations, suggestions}`): đọc hết rồi phát một lần.
 *
 * `idleMs`: không nhận được byte nào (kể cả keepalive 30 giây của n8n) trong khoảng này thì
 * dừng — n8n treo hoặc mạng rớt, chờ tiếp chỉ làm người dùng nhìn vòng quay vô ích.
 * Lỗi mạng/huỷ từ `signal` của fetch được ném lại cho nơi gọi tự phân loại.
 */
export async function relayN8nResponse(
  response: Response,
  onDelta: (text: string) => void,
  options: { idleMs: number }
): Promise<AiRelayResult> {
  if (response.status < 200 || response.status >= 300 || !response.body) {
    const raw = await response.text().catch(() => "");
    const decoded = decodeAiWebhookResponse(raw, response.status);
    return { ok: false, code: decoded.ok ? "AI_INVALID_RESPONSE" : decoded.code };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // Kiểu khai báo bằng `as`: các biến này đổi bên trong handleLine, TS không theo dõi được
  // phép gán trong closure nên sẽ thu hẹp nhầm về giá trị khởi tạo.
  let mode = "unknown" as "unknown" | "stream" | "legacy";
  let legacy = "";
  let answer = "";
  let streamError = null as AiErrorCode | null;
  let responderError = null as AiErrorCode | null;

  const handleLine = (line: string) => {
    if (mode === "legacy") {
      legacy += `${line}\n`;
      return;
    }
    const chunk = parseN8nStreamLine(line);
    if (!chunk) {
      if (mode === "unknown" && line.trim()) {
        mode = "legacy";
        legacy += `${line}\n`;
      }
      return;
    }
    mode = "stream";
    if (chunk.type === "error") {
      streamError = classifyAiProviderError(chunk.content ?? "");
      return;
    }
    if (chunk.type !== "item" || !chunk.content) return;
    const code = errorCodeFromStreamItem(chunk.content);
    if (code) {
      responderError = code;
      return;
    }
    answer += chunk.content;
    onDelta(chunk.content);
  };

  const readWithIdleLimit = () =>
    new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new AiIdleTimeoutError()), options.idleMs);
      reader.read().then(
        (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });

  try {
    for (;;) {
      const { done, value } = await readWithIdleLimit();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    if (buffer) handleLine(buffer);
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof AiIdleTimeoutError) return { ok: false, code: "AI_TIMEOUT" };
    throw error;
  }

  if (mode !== "stream") {
    const decoded = decodeAiWebhookResponse(legacy, response.status);
    if (!decoded.ok) return { ok: false, code: decoded.code };
    const text = String(decoded.payload.answer ?? decoded.payload.output ?? "").trim();
    if (!text) return { ok: false, code: "AI_EMPTY_ANSWER" };
    onDelta(text);
    return { ok: true, answer: text, legacyPayload: decoded.payload };
  }
  if (responderError) return { ok: false, code: responderError };
  if (!answer.trim()) return { ok: false, code: streamError ?? "AI_EMPTY_ANSWER" };
  return { ok: true, answer: answer.trim(), legacyPayload: null };
}
