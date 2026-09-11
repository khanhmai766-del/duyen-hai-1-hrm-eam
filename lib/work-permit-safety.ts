import type { PermitKind } from "@/lib/work-permits";

export const SAFETY_PAGE_SIZE = 10;
export const SAFETY_MAX_ROWS = 100;
export interface SafetySelection {
  sourceId?: string;
  hazard: string;
  measure: string;
  forAuthorization: boolean;
  forExecution: boolean;
}
export interface SafetyItem {
  id: string; kind: PermitKind;
  hazard: string; measure: string; source: string;
  isActive: boolean; version: number;
}
export function safetySummary(value: unknown): string {
  if (!Array.isArray(value) || !value.length) return "Chưa chọn";
  return value.map((row: SafetySelection, i) => `${i + 1}. ${row.hazard} — ${row.measure} (${[row.forAuthorization && "Đơn vị cho phép", row.forExecution && "Đơn vị công tác"].filter(Boolean).join("; ") || "Chưa phân công"})`).join("\n");
}
/** Phần A giữ cặp; B/C lấy biện pháp theo phân công và gộp nội dung trùng nguyên văn. */
export function safetyPrintData(rows: SafetySelection[]) {
  const unique = (items: SafetySelection[]) => [...new Set(items.map(row => row.measure.trim()))];
  return { hazards: rows.map(row => ({ hazard: row.hazard, measure: row.measure })),
    authorization: unique(rows.filter(row => row.forAuthorization)), execution: unique(rows.filter(row => row.forExecution)) };
}
