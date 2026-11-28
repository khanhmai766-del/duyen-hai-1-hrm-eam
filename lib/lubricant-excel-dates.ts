import { normalizeText } from "@/lib/nav";
import { parseVNDate } from "@/lib/tbycnn";

const normalize = (value: string) => normalizeText(value).replace(/\s+/g, " ").trim();

export function hasOilSupplement(value: string) {
  return /\b(?:bo (?:sung|xung)|cham)\b/.test(normalize(value));
}

export function parseExcelLastDate(value?: string) {
  let latest: Date | null = null;
  const raw = value ?? "";
  for (const entry of hasOilSupplement(raw) ? raw.split(/[;\n]/) : [raw]) {
    // Một ghi chú bổ sung có ngày riêng không làm mất ngày thay ở trước ngoặc.
    const replacement = entry.replace(/\(\s*\d{1,2}\/\d{1,2}\/\d{2,4}\b[^()]*\)/g,
      (note) => hasOilSupplement(note) ? "" : note).trim();
    if (hasOilSupplement(replacement)) continue;
    const match = /^(\d{1,2}\/\d{1,2}\/)(\d{4}|\d{2})(?:\s*\(([^()]*)\))?$/.exec(replacement);
    if (!match || (match[3] && !/^thay (?:moi|dau)\b/.test(normalize(match[3])))) continue;
    const date = parseVNDate(`${match[1]}${match[2].length === 2 ? `20${match[2]}` : match[2]}`);
    if (date && (!latest || date > latest)) latest = date;
  }
  return latest;
}

/** Chu kỳ thay (tháng) theo cột "Thời gian cần thay theo OM"; null nếu không phải chu kỳ tháng/năm đơn. */
export function excelIntervalMonths(cell?: string) {
  const interval = normalize(cell?.split("\n")[0] ?? "");
  if (/kiem tra|lay mau|bo sung/.test(interval)) return null;
  const periods = [...interval.matchAll(/\b(\d+)\s*(thang|nam)\b/g)];
  if (periods.length !== 1) return null;
  return Number(periods[0][1]) * (periods[0][2] === "nam" ? 12 : 1);
}
