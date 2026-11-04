import { CTKTKT_GROUP_META, getCtktktFieldGroup } from "./ctktkt-permissions";
import { CTKTKT_TEXT_INPUT_CELLS } from "./ctktkt-extra-fields";
import { normalizeCtktktOperationEvents, CTKTKT_OPERATION_EVENTS_CELL } from "./ctktkt-operation-events";

export type CtktktHistoryRange = { group: string; from: string; to: string };
export const CTKTKT_HISTORY_GROUPS = [...Object.entries(CTKTKT_GROUP_META).map(([group, meta]) => ({ group, label: meta.label })), { group: "other", label: "Các ô nhập tay khác" }];

export function validateCtktktHistoryRanges(raw: unknown, month: string): CtktktHistoryRange[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > CTKTKT_HISTORY_GROUPS.length) throw new Error("Hãy chọn ít nhất một cụm bảng và khoảng ngày cần nhập.");
  const groups = new Set<string>();
  return raw.map(item => {
    if (!item || typeof item !== "object") throw new Error("Khoảng ngày nhập không hợp lệ.");
    const {group, from, to} = item;
    if (!CTKTKT_HISTORY_GROUPS.some(entry => entry.group === group) || groups.has(group)) throw new Error("Cụm bảng nhập không hợp lệ hoặc trùng lặp.");
    groups.add(group);
    for (const date of [from, to]) {
      if (typeof date !== "string" || !date.startsWith(`${month}-`) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) throw new Error("Ngày bắt đầu/kết thúc phải hợp lệ và nằm trong tháng nhập.");
    }
    if (from > to) throw new Error("Ngày bắt đầu không được sau ngày kết thúc.");
    return {group, from, to};
  });
}

export function isCtktktHistoryCellSelected(ranges: CtktktHistoryRange[], date: string, cell: string) {
  const group = getCtktktFieldGroup(cell) || "other";
  return ranges.some(range => range.group === group && date >= range.from && date <= range.to);
}

export function selectCtktktHistoryDays<T extends {date: string; manualEntries: {cell: string; value: string; sourceCell?: string}[]}>(days: T[], ranges: CtktktHistoryRange[]) {
  return days.map(day => ({...day, manualEntries: day.manualEntries.filter(entry => isCtktktHistoryCellSelected(ranges, day.date, entry.cell)).map(entry => {
    if (entry.cell === CTKTKT_OPERATION_EVENTS_CELL) return {...entry, value: normalizeCtktktOperationEvents(entry.value)};
    if (CTKTKT_TEXT_INPUT_CELLS.has(entry.cell) || entry.cell === "T181") return entry;
    const value = entry.value.trim().replaceAll(" ", "").replace(",", ".");
    if (!/^-?\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) throw new Error(`Ngày ${day.date.split("-").reverse().join("/")}, ô ${entry.sourceCell || entry.cell}: dữ liệu nhập tay không phải số hợp lệ. Hãy sửa file hoặc bỏ ngày/cụm này khỏi lựa chọn.`);
    return {...entry, value};
  })})).filter(day => day.manualEntries.length > 0);
}
