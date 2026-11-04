import type { getRawDb } from "@/modules/ctktkt/db";
import {
  calculateOperatingHours,
  CTKTKT_OPERATING_HOURS_SOURCE_CODES,
  CTKTKT_OPERATING_HOURS_START_DATE,
  formatOperatingHours,
  type OperatingHoursTotals,
} from "./ctktkt-operating-hours";

type RawDb = ReturnType<typeof getRawDb>;

function monthlyRanges(next: string) {
  const ranges: Array<[string, string]> = [];
  let from = CTKTKT_OPERATING_HOURS_START_DATE;
  while (from < next && ranges.length < 24) {
    const year = Number(from.slice(0, 4)), month = Number(from.slice(5, 7));
    const following = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const end = following < next ? following : next;
    ranges.push([from, end]); from = end;
  }
  // Preserve old behavior for exceptionally broad requests, without thousands
  // of queries. Normal reports reuse closed-month cache entries independently.
  return from < next ? [[CTKTKT_OPERATING_HOURS_START_DATE, next]] : ranges;
}

/**
 * Lũy kế giờ theo QLKT cho các ngày trong [from, next).
 * Trả về các ô W68:Z69 dạng liên kết và danh sách ngày QLKT còn thiếu giờ phát tới hết khoảng.
 */
export async function loadCtktktOperatingHours(db: RawDb, from: string, next: string) {
  const codes = [...CTKTKT_OPERATING_HOURS_SOURCE_CODES];
  const chunks = await Promise.all(monthlyRanges(next).map(([start, end]) => db.prepare(
    `SELECT operating_date AS operatingDate, field_code AS fieldCode, value FROM daily_inputs WHERE operating_date >= ? AND operating_date < ? AND field_code IN (${codes.map(() => "?").join(", ")})`,
  ).bind(start, end, ...codes).all()));
  const results = chunks.flatMap(chunk => chunk.results);
  const daily = new Map<string, Record<string, string>>();
  for (const row of results as Array<{ operatingDate: string; fieldCode: string; value: string }>) {
    const day = daily.get(row.operatingDate) || {};
    day[row.fieldCode] = String(row.value ?? "");
    daily.set(row.operatingDate, day);
  }
  const lastDate = new Date(`${next}T12:00:00Z`);
  lastDate.setUTCDate(lastDate.getUTCDate() - 1);
  const through = lastDate.toISOString().slice(0, 10);
  const result = calculateOperatingHours(daily, through);
  const entries: Array<{ operatingDate: string; cell: string; value: string }> = [];
  const totalsByDate = new Map<string, OperatingHoursTotals>();
  for (const [operatingDate, totals] of result.byDate) {
    if (operatingDate < from) continue;
    totalsByDate.set(operatingDate, totals);
    for (const [cell, value] of Object.entries(totals)) entries.push({ operatingDate, cell, value: formatOperatingHours(value) });
  }
  return { entries, totalsByDate, missingDates: result.missingDates };
}
