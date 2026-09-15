import type { AiCitation } from "@/lib/ai-chat";

/**
 * Sự kiện website phát cho trình duyệt trong MỘT lượt hỏi AI — mỗi dòng một JSON
 * (application/x-ndjson). Dùng chung cho route `/api/ai/chat` và chatbox.
 */
export type AiChatStreamEvent =
  | { type: "meta"; conversationId: string }
  | { type: "status"; label: string }
  | { type: "tool"; label: string }
  | { type: "delta"; text: string }
  | {
      type: "done";
      conversationId: string;
      answer: string;
      citations: AiCitation[];
      suggestions: string[];
      expiresAt: string;
      saved: boolean;
    }
  | { type: "error"; code: string; message: string; partial: boolean }
  | { type: "ping" };

export class AiChatRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "AiChatRequestError";
  }
}

/**
 * Gửi câu hỏi và đọc luồng sự kiện. Lỗi chặn trước khi bắt đầu (chưa đăng nhập, hết quyền,
 * đang có câu hỏi khác…) vẫn là phong bì JSON `{ error }` thường nên đọc theo kiểu đó.
 *
 * Không dùng `apiMutate` của lib/fetcher.ts vì hàm đó đợi hết body mới trả — mất ý nghĩa
 * của streaming.
 */
export async function streamAiChat(
  body: { question: string; conversationId: string | null },
  onEvent: (event: AiChatStreamEvent) => void,
  signal: AbortSignal
) {
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("ndjson") || !response.body) {
    const text = await response.text().catch(() => "");
    let message = "";
    try {
      message = String((JSON.parse(text) as { error?: unknown }).error ?? "");
    } catch {
      // Trang HTML của nginx hoặc trang đăng nhập — dựng câu dễ hiểu bên dưới.
    }
    if (!message) {
      message = response.redirected && /\/login/.test(response.url)
        ? "Phiên đăng nhập đã hết hạn. Hãy tải lại trang và đăng nhập lại."
        : `Máy chủ không phản hồi đúng (mã ${response.status}). Câu hỏi chưa được lưu, vui lòng thử lại.`;
    }
    throw new AiChatRequestError(message, response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let event: AiChatStreamEvent;
    try {
      event = JSON.parse(line) as AiChatStreamEvent;
    } catch {
      return;
    }
    if (event.type === "done" || event.type === "error") finished = true;
    onEvent(event);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      handleLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  handleLine(buffer + decoder.decode());
  if (!finished) {
    throw new AiChatRequestError("Mất kết nối với máy chủ giữa chừng. Câu hỏi chưa được lưu, vui lòng thử lại.", 0);
  }
}
