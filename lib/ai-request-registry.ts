import type { AiCitation } from "@/lib/ai-chat";

/**
 * SỔ THEO DÕI MỘT LƯỢT HỎI AI — sống trong bộ nhớ tiến trình, tối đa vài phút.
 *
 * Một câu hỏi đi vòng: website → n8n → Gemini → các công cụ tra cứu (chạy lại TRÊN WEBSITE)
 * → Gemini → n8n → website. Website là nơi duy nhất nhìn thấy cả hai đầu, nên sổ này làm ba
 * việc mà n8n không làm được hoặc làm không chắc:
 *
 *   1. ĐẾM SỐ LẦN GỌI CÔNG CỤ. Mỗi lần gọi là thêm một lượt Gemini; mô hình lặp vô hạn là
 *      cạn quota của cả nhà máy chỉ vì một câu hỏi. AI Agent của n8n có tuỳ chọn giới hạn
 *      nhưng rào ở đây thì không phụ thuộc cấu hình workflow ai đó có thể quên đặt.
 *   2. PHÁT TIẾN TRÌNH THẬT ("Đang tìm thiết bị…"). Chế độ streaming của n8n chỉ phát chữ
 *      trả lời, không báo lúc mô hình đang gọi công cụ — mà công cụ lại chạy ngay trên website.
 *   3. GOM NGUỒN TRÍCH DẪN PHÍA MÁY CHỦ. Bản cũ bắt mô hình tự chép lại URL + chữ ký `proof`
 *      của từng nguồn vào JSON đầu ra; mô hình hay chép sai/cắt ngắn nên nguồn bị loại. Nguồn
 *      nào công cụ đã thật sự trả về thì website tự biết, không cần mô hình kể lại.
 *
 * Gắn vào `globalThis` để mọi route (chat + bốn công cụ) chắc chắn dùng CHUNG một bản trong
 * cùng tiến trình. pm2 chạy fork 1 instance (xem docs/huong-dan-deploy-production.md phụ lục D)
 * nên bộ nhớ tiến trình là đủ; reload giữa chừng thì lượt hỏi đó hỏng như mọi request khác.
 */
export type AiToolName =
  | "search-devices"
  | "search-defects"
  | "device-history"
  | "material-replacements"
  | "shift-schedule"
  | "search-announcements"
  | "search-knowledge-base";

export const AI_TOOL_LABELS: Record<AiToolName, string> = {
  "search-devices": "Đang tìm thiết bị",
  "search-defects": "Đang tra cứu khiếm khuyết",
  "device-history": "Đang đọc lịch sử thiết bị",
  "material-replacements": "Đang tra cứu thay vật tư",
  "shift-schedule": "Đang xem lịch trực ca",
  "search-announcements": "Đang đọc thông báo, mệnh lệnh",
  "search-knowledge-base": "Đang tra cứu tài liệu hướng dẫn",
};

/** Số lần gọi công cụ tối đa cho MỘT câu hỏi — quá mức này là mô hình đang lặp. */
export const AI_MAX_TOOL_CALLS = 6;
/** Số nguồn tối đa hiển thị dưới một câu trả lời. */
export const AI_MAX_CITATIONS = 8;
const REQUEST_TTL_MS = 5 * 60_000;

export type AiProgressEvent = { type: "tool"; tool: AiToolName; label: string; call: number };

type AiRequestEntry = {
  userId: string;
  conversationId: string;
  toolCalls: number;
  citations: Map<string, AiCitation>;
  listeners: Set<(event: AiProgressEvent) => void>;
  expiresAt: number;
};

const globalStore = globalThis as typeof globalThis & { __dh1AiRequests?: Map<string, AiRequestEntry> };
const store: Map<string, AiRequestEntry> = (globalStore.__dh1AiRequests ??= new Map());

function sweep(now = Date.now()) {
  for (const [id, entry] of store) if (entry.expiresAt < now) store.delete(id);
}

export function openAiRequest(requestId: string, owner: { userId: string; conversationId: string }) {
  sweep();
  store.set(requestId, {
    ...owner,
    toolCalls: 0,
    citations: new Map(),
    listeners: new Set(),
    expiresAt: Date.now() + REQUEST_TTL_MS,
  });
}

export function closeAiRequest(requestId: string) {
  store.delete(requestId);
}

export function subscribeAiRequest(requestId: string, listener: (event: AiProgressEvent) => void) {
  const entry = store.get(requestId);
  if (!entry) return () => {};
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

function ownedEntry(requestId: string, owner: { userId: string; conversationId: string }) {
  const entry = store.get(requestId);
  // Capability đã được ký nên lệch chủ gần như không thể xảy ra; lệch thì coi như không theo dõi
  // chứ không chặn, vì chặn nhầm là người dùng mất câu trả lời.
  if (!entry || entry.userId !== owner.userId || entry.conversationId !== owner.conversationId) return null;
  return entry;
}

/**
 * Xin một lượt gọi công cụ. `allowed: false` khi câu hỏi đã dùng hết số lượt.
 *
 * Lượt hỏi không còn trong sổ (hết hạn, tiến trình vừa reload) thì vẫn cho chạy nhưng không
 * đếm: công cụ tự rào quyền bằng capability đã ký, sổ này chỉ là lớp tối ưu.
 */
export function claimAiToolCall(
  requestId: string,
  owner: { userId: string; conversationId: string },
  tool: AiToolName
) {
  const entry = ownedEntry(requestId, owner);
  if (!entry) return { allowed: true, tracked: false };
  entry.toolCalls += 1;
  if (entry.toolCalls > AI_MAX_TOOL_CALLS) return { allowed: false, tracked: true };
  const event: AiProgressEvent = { type: "tool", tool, label: AI_TOOL_LABELS[tool], call: entry.toolCalls };
  for (const listener of entry.listeners) {
    try {
      listener(event);
    } catch {
      // Người nghe hỏng (luồng trình duyệt đã đóng) không được làm hỏng lượt gọi công cụ.
    }
  }
  return { allowed: true, tracked: true };
}

/** Số lượt gọi công cụ ĐÃ ĐƯỢC PHÉP của lượt hỏi — đọc trước `closeAiRequest` để ghi số liệu. */
export function aiRequestToolCalls(requestId: string) {
  const entry = store.get(requestId);
  return entry ? Math.min(entry.toolCalls, AI_MAX_TOOL_CALLS) : 0;
}

export function recordAiCitations(
  requestId: string,
  owner: { userId: string; conversationId: string },
  citations: AiCitation[]
) {
  const entry = ownedEntry(requestId, owner);
  if (!entry) return;
  for (const citation of citations) {
    const key = `${citation.sourceType}:${citation.sourceId}`;
    if (!entry.citations.has(key)) entry.citations.set(key, citation);
  }
}

/**
 * Nguồn của lượt hỏi, xếp nguồn được CÂU TRẢ LỜI nhắc tới lên trước (theo mã/tiêu đề), rồi
 * mới tới các nguồn công cụ trả về nhưng không được dùng. Cắt còn `AI_MAX_CITATIONS`.
 */
export function aiRequestCitations(requestId: string, answer = ""): AiCitation[] {
  const entry = store.get(requestId);
  if (!entry) return [];
  const haystack = answer.toLowerCase();
  const mentioned = (citation: AiCitation) => {
    const id = citation.sourceId.toLowerCase();
    const head = citation.title.split(" — ")[0]?.trim().toLowerCase() ?? "";
    return Boolean((id.length >= 4 && haystack.includes(id)) || (head.length >= 4 && haystack.includes(head)));
  };
  const all = [...entry.citations.values()];
  return [...all.filter(mentioned), ...all.filter((citation) => !mentioned(citation))].slice(0, AI_MAX_CITATIONS);
}
