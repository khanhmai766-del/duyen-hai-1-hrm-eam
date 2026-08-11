/**
 * Chuẩn hóa số phiếu công tác để cột Nguồn chỉ còn phần số công tác.
 * Hỗ trợ các tiền tố cũ như "PCT số", "PCT cơ", "PCT cơ (giấy)".
 */
export function normalizePctNumber(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";

  return trimmed
    .replace(/^PCT\s*(?:(?:số|cơ)\s*(?:\([^)]*\))?)?\s*(?:[:.;,·|–—-]+\s*)?/iu, "")
    .trim();
}

/**
 * Khi đã có số PCT riêng, bỏ nhãn PCT bị nhập lặp trong ghi chú nguồn nhưng vẫn giữ
 * nội dung nghiệp vụ còn lại như BBNT DO hoặc hình thức lãnh.
 */
export function normalizeReplacementSourceNote(
  value: string | null | undefined,
  pctNumber: string | null | undefined
): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || !normalizePctNumber(pctNumber)) return trimmed;

  return trimmed
    .replace(/^PCT\s*(?:(?:số|cơ)\s*(?:\([^)]*\))?)?\s*(?:[:.;,·|–—-]+\s*)?/iu, "")
    .trim();
}
