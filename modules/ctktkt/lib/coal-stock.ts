// Node's built-in TypeScript test runner requires the explicit extension here.
import { previousIsoDate, type CtktktDayEntries } from "./ctktkt-report";
import { deriveDailyValuesFromCtktkt } from "./daily-source-links";

/** Than tồn kho 24h ngày 01 của tháng, nhập tay một lần để các ngày sau tự liên kết. */
export const COAL_STOCK_24H_START_CELL = "COAL_STOCK_24H_START";

/** Chỉ cần nhập tồn kho 24h thủ công vào ngày đầu tháng. */
export function isCoalStock24hStartEntryRequired(date: string) {
  return date.slice(8, 10) === "01";
}

export type CoalStockDay = {
  date: string;
  stock: number | null;
  intake: number | null;
  consumption: number | null;
};

export type CoalStockResult = {
  stock: number | null;
  missing: string | null;
  days: CoalStockDay[];
};

function numberOf(entries: CtktktDayEntries | undefined, cell: string) {
  const raw = entries?.[cell]?.trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function displayDate(date: string) {
  return date.split("-").reverse().join("/");
}

function nextIsoDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

/** Tiêu thụ đã quy ẩm 8,5% của S1 + S2 (cùng số W88 "theo PMIS" của file gốc). */
export function coalConsumptionTonnes(current: CtktktDayEntries, previous?: CtktktDayEntries) {
  const values = deriveDailyValuesFromCtktkt(current, previous);
  const s1 = numberOf(values, "AE_ADJ");
  const s2 = numberOf(values, "AF_ADJ");
  return s1 === null || s2 === null ? null : s1 + s2;
}

/**
 * W86 (than tồn kho ngày D-1 theo PMIS): ngày 01 nhập tay, các ngày sau = W89 ngày D-1 = W86 + W87 − W88.
 * W87 trống được tính là 0 giống công thức Excel.
 */
export function calculatePmisCoalStockOpening(
  entriesByDate: ReadonlyMap<string, CtktktDayEntries>,
  targetDate: string,
): CoalStockResult {
  const firstDate = `${targetDate.slice(0, 8)}01`;
  const days: CoalStockDay[] = [];
  const seed = numberOf(entriesByDate.get(firstDate), "W86");
  if (seed === null) {
    return { stock: null, missing: `Chưa nhập than tồn kho ngày D-1 theo PMIS (W86) ngày ${displayDate(firstDate)}.`, days };
  }
  let stock = seed;
  days.push({ date: firstDate, stock, intake: null, consumption: null });
  for (let date = firstDate; date < targetDate; date = nextIsoDate(date)) {
    const current = entriesByDate.get(date);
    const consumption = current ? coalConsumptionTonnes(current, entriesByDate.get(previousIsoDate(date))) : null;
    if (consumption === null) return { stock: null, missing: `Chưa đủ số liệu than tiêu thụ ngày ${displayDate(date)}.`, days };
    const intake = numberOf(current, "W87") ?? 0;
    stock = stock + intake - consumption;
    days.push({ date: nextIsoDate(date), stock, intake, consumption });
  }
  return { stock, missing: null, days };
}

/**
 * Than tồn kho 24h ngày D =tồn kho 24h ngày D-1 + than nhập 24h (I36) ngày D − than tiêu thụ S1 + S2 ngày D.
 * Ngày 01 lấy số nhập tay; chuỗi dừng ở ngày đầu tiên thiếu số liệu thay vì tự coi là 0.
 */
export function calculateCoalStock24h(
  entriesByDate: ReadonlyMap<string, CtktktDayEntries>,
  targetDate: string,
): CoalStockResult {
  const direct = numberOf(entriesByDate.get(targetDate), COAL_STOCK_24H_START_CELL);
  if (direct !== null) return { stock: direct, missing: null, days: [] };
  const firstDate = `${targetDate.slice(0, 8)}01`;
  const days: CoalStockDay[] = [];
  const seed = numberOf(entriesByDate.get(firstDate), COAL_STOCK_24H_START_CELL);
  if (seed === null) {
    return { stock: null, missing: `Chưa nhập than tồn kho 24h ngày ${displayDate(firstDate)}.`, days };
  }
  days.push({ date: firstDate, stock: seed, intake: null, consumption: null });

  let stock = seed;
  for (let date = nextIsoDate(firstDate); date <= targetDate; date = nextIsoDate(date)) {
    const current = entriesByDate.get(date);
    const intake = numberOf(current, "I36");
    if (intake === null) return { stock: null, missing: `Chưa nhập than nhập 24h (I36) ngày ${displayDate(date)}.`, days };
    const consumption = current ? coalConsumptionTonnes(current, entriesByDate.get(previousIsoDate(date))) : null;
    if (consumption === null) return { stock: null, missing: `Chưa đủ số liệu than tiêu thụ ngày ${displayDate(date)}.`, days };
    stock = stock + intake - consumption;
    days.push({ date, stock, intake, consumption });
  }
  return { stock, missing: null, days };
}
