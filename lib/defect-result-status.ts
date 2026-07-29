import { normalizeText } from "@/lib/nav";

export type DefectResultStatus =
  | "CHUA_XU_LY"
  | "CO_PCT"
  | "CHO_VAT_TU"
  | "CHO_NGUNG_MAY"
  | "DA_XU_LY";

/**
 * Chuẩn hoá nhãn kết quả sửa chữa tự do từ Google Sheet.
 * Dùng chung cho pull-sync và quy tắc rút ngắn thời gian chờ lịch sử.
 */
export function defectResultStatusOf(value: unknown): DefectResultStatus | null {
  const normalized = normalizeText(String(value ?? "").trim());
  if (!normalized) return null;
  if (normalized.includes("chua xu ly") || normalized.includes("chua thuc hien")) return "CHUA_XU_LY";
  if (normalized.includes("cho vat tu")) return "CHO_VAT_TU";
  if (normalized.includes("cho ngung may")) return "CHO_NGUNG_MAY";
  if (normalized.includes("dang xu ly") || normalized.includes("dang thuc hien")) return "CO_PCT";
  if (
    normalized.includes("da thuc hien xong")
    || normalized.includes("da xu ly")
    || normalized.includes("da xong")
    || normalized.includes("hoan thanh")
  ) {
    return "DA_XU_LY";
  }
  return null;
}
