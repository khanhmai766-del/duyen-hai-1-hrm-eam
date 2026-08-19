import { normalizeText } from "@/lib/nav";

function parseReminderDate(value: unknown): Date | null {
  const match = String(value ?? "").match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (!match) return null;
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const date = new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[1])));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Đọc bộ đếm nhắc lại từ cả định dạng Sheet cũ lẫn định dạng web đang ghi. */
export function reminderSummaryOf(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return { count: 0, lastDate: null as Date | null, dateKeys: [] as string[] };

  const normalized = normalizeText(raw);
  const declaredCount = Number(normalized.match(/so lan nhac lai\s*:?\s*(\d+)/)?.[1] ?? 0);
  // Dữ liệu cũ trên Sheet không thống nhất: dòng đầu thường là
  // "Nhắc lại lần 1", các dòng sau chỉ còn "Lần 2", "Lần 3"...
  const numberedCounts = Array.from(normalized.matchAll(/(?:nhac lai\s*)?\blan\s*(?:thu\s*)?(\d+)/g))
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const dates = Array.from(raw.matchAll(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/g))
    .map((match) => parseReminderDate(match[0]))
    .filter((date): date is Date => Boolean(date));
  const distinctDates = new Set(dates.map((date) => date.toISOString().slice(0, 10)));
  const count = Math.max(
    declaredCount,
    numberedCounts.length ? Math.max(...numberedCounts) : 0,
    distinctDates.size,
    1
  );
  const lastDate = dates.length
    ? new Date(Math.max(...dates.map((date) => date.getTime())))
    : null;
  return { count, lastDate, dateKeys: dates.map((date) => date.toISOString().slice(0, 10)) };
}
