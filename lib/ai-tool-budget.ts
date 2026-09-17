/**
 * NGÂN SÁCH TOKEN cho kết quả công cụ AI.
 *
 * Kết quả công cụ đi thẳng vào ngữ cảnh của mô hình và được gửi lại ở mọi vòng suy luận sau đó.
 * Một câu hỏi tra cứu 2 lần gửi mô hình 3 lượt, lượt sau mang lại cả prompt, lịch sử và mọi kết
 * quả công cụ trước đó — nên mỗi ký tự ở đây bị tính tiền nhiều lần (tầng 1–2 VietAPI trả theo
 * token) và ăn vào hạn mức miễn phí của Gemini tầng 3. Mức này đặt từ thời Groq dự phòng 8.000
 * token/phút; bỏ Groq rồi vẫn giữ vì nó giữ chi phí và độ trễ mỗi câu thấp.
 *
 * Tiếng Việt có dấu tốn khoảng 2,5–3 ký tự cho một token, nên 4.500 ký tự ≈ 1.500–1.800 token.
 */
export const AI_TOOL_RESULT_CHAR_BUDGET = 4_500;
export const AI_TOOL_TEXT_LIMIT = 200;

/** Chỉ giữ trường CÓ GIÁ TRỊ, ngày về ISO, chuỗi dài cắt còn `AI_TOOL_TEXT_LIMIT` ký tự. */
export function compactAiFacts(values: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    if (value instanceof Date) out[key] = value.toISOString();
    else if (typeof value === "string") {
      const trimmed = value.replace(/\s+/g, " ").trim();
      if (!trimmed) continue;
      out[key] = trimmed.length > AI_TOOL_TEXT_LIMIT ? `${trimmed.slice(0, AI_TOOL_TEXT_LIMIT)}…` : trimmed;
    } else out[key] = value;
  }
  return out;
}

/**
 * Giữ các kết quả đầu (đã sắp mới nhất trước) cho tới khi chạm ngân sách ký tự. Luôn giữ ít nhất
 * một kết quả để mô hình không trả lời "không có dữ liệu" khi thật ra có.
 */
export function fitAiToolItems<T>(items: T[], budget = AI_TOOL_RESULT_CHAR_BUDGET) {
  const kept: T[] = [];
  let size = 2;
  for (const item of items) {
    const length = JSON.stringify(item).length + 1;
    if (kept.length > 0 && size + length > budget) break;
    kept.push(item);
    size += length;
  }
  return { items: kept, omitted: items.length - kept.length };
}
