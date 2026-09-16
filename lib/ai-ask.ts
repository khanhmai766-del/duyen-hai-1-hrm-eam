import type { AiPageContext } from "@/lib/ai-chat";

/**
 * MỞ CHATBOX TỪ BẤT KỲ TRANG NÀO, kèm câu hỏi và ngữ cảnh đang xem.
 *
 * Chatbox gắn một lần duy nhất ở `components/layout/app-shell.tsx`, nằm ngoài cây component của
 * các trang nghiệp vụ. Truyền hàm mở xuống bằng context sẽ buộc mọi trang phải bọc provider,
 * nên dùng sự kiện trên `window`: trang nào cũng gọi được, không trang nào phải biết chatbox
 * đang ở đâu, và không có trang nào phải render lại khi chatbox đổi trạng thái.
 */
export const AI_ASK_EVENT = "dh1:ask-ai";

/** Phần ngữ cảnh do trang cung cấp; đường dẫn do chính chatbox tự điền. */
export type AiAskEntity = Pick<AiPageContext, "entityType" | "entityId" | "label">;

export type AiAskRequest = {
  question: string;
  /** true = gửi luôn; false (mặc định) = điền sẵn vào ô nhập để người dùng sửa trước khi gửi. */
  send?: boolean;
  entity?: AiAskEntity | null;
};

export function askAi(request: AiAskRequest) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AiAskRequest>(AI_ASK_EVENT, { detail: request }));
}
