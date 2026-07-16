/**
 * Đọc số theo quy ước dữ liệu ERP: dấu phẩy ngăn cách hàng nghìn,
 * dấu chấm ngăn cách phần thập phân (ví dụ: 2,248.5 = 2248.5).
 */
export function parseErpNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;

  const normalized = String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/,/g, "");

  if (!normalized) return Number.NaN;
  return Number(normalized);
}
