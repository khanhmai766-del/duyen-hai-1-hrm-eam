import { mnkShiftOf } from "./classify";
import { DEFAULT_MEASURE_GROUP, MEASURE_GROUPS } from "./constants";
import { addDays } from "./parse";

/**
 * Tổng hợp tiến độ nhập số đo theo cương vị — tái hiện "Nhắc nhập liệu quá hạn" của VibraControl cũ (entry-reminders.js):
 * hạn của từng kỳ đo tính theo ngày tham chiếu (giờ VN); thiết bị ĐÃ NHẬP khi có lần đo trong [hạn, ngày tham chiếu]
 * mà có số đo, hoặc số đo Mill/MNK, hoặc có ghi chú bất kỳ (Máy dự phòng, Ngừng sửa chữa…) — hasEntryRecord của app.js.
 * Tệp thuần (không import server) để test và dùng chung.
 */

export const MNK_SHIFT_GROUP = "mnkca";

export const SUMMARY_GROUP_LABELS: Record<string, string> = {
  ...Object.fromEntries(MEASURE_GROUPS.map((g) => [g.id, g.label])),
  [MNK_SHIFT_GROUP]: "MNK theo ca",
};
const KNOWN_GROUPS = new Set<string>(MEASURE_GROUPS.map((g) => g.id));

export interface SummaryDevice { id: string; area: string; name: string; active: boolean; measureGroups: string[] }
export interface SummaryRecord { deviceId: string; date: string | null; values?: unknown[]; millData?: Record<string, unknown> | null; note?: string }

export interface SummaryRow {
  area: string;
  group: string;
  groupLabel: string;
  /** Hạn (YYYY-MM-DD) = đầu cửa sổ tính "đã nhập". */
  due: string;
  total: number;
  entered: number;
  missing: { id: string; name: string }[];
  complete: boolean;
}
export interface EntrySummary {
  date: string;
  group: string;
  rows: SummaryRow[];
  /** Cương vị có thiết bị phải nhập (để dựng ô chọn), theo thứ tự bảng. */
  areas: string[];
  totals: { areas: number; areasComplete: number; devices: number; entered: number; missing: number; percent: number };
}

const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = CN … 4 = thứ 5
function lastWeekdayBefore(today: string, wd: number) {
  let d = addDays(today, -1);
  while (dow(d) !== wd) d = addDays(d, -1);
  return d;
}
/** Thứ 5 thứ n của tháng (m: 1–12). */
export function nthThursday(y: number, m: number, n: number) {
  let d = `${y}-${String(m).padStart(2, "0")}-01`;
  while (dow(d) !== 4) d = addDays(d, 1);
  return addDays(d, 7 * (n - 1));
}
const WEEKDAY: Record<string, number> = { thu2: 1, thu3: 2, thu4: 3, thu5: 4, thu6: 5, thu7: 6, chunhat: 0 };

/** Hạn gần nhất ĐÃ QUA (trước ngày tham chiếu) của một kỳ đo; null nếu kỳ không hợp lệ. */
export function groupDueDate(group: string, today: string): string | null {
  if (group === "hangngay" || group === MNK_SHIFT_GROUP) return addDays(today, -1);
  if (group in WEEKDAY) return lastWeekdayBefore(today, WEEKDAY[group]);
  const n = Number(/^tuan(\d)$/.exec(group)?.[1]);
  if (!n) return null;
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const cur = nthThursday(y, m, n);
  return cur < today ? cur : nthThursday(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1, n);
}

const filled = (v: unknown) => v != null && String(v).trim() !== "";
/** Bản ghi có nội dung: số đo, số đo Mill/MNK (bỏ schemaVersion/shift) hoặc ghi chú. */
export function hasEntryRecord(r: SummaryRecord) {
  return (
    (r.values ?? []).some(filled) ||
    Object.entries(r.millData ?? {}).some(([k, v]) => k !== "schemaVersion" && k !== "shift" && typeof v === "number" && Number.isFinite(v)) ||
    String(r.note ?? "").trim() !== ""
  );
}

/** Ngày xa nhất cần đọc bản ghi cho một kỳ (để API chỉ truy vấn một khoảng). */
export function summaryFromDate(group: string, today: string) {
  const groups = group === "all" ? MEASURE_GROUPS.map((g) => g.id as string) : [group];
  return groups.map((g) => groupDueDate(g, today)).filter((d): d is string => !!d).sort()[0] ?? today;
}

export function computeEntrySummary(input: {
  devices: SummaryDevice[];
  records: SummaryRecord[];
  date: string;
  group: string;
  area?: string;
  compareAreas?: (a: string, b: string) => number;
}): EntrySummary {
  const { devices, records, date, group } = input;
  const cmp = input.compareAreas ?? ((a: string, b: string) => a.localeCompare(b, "vi"));
  const byDevice = new Map<string, string[]>(); // deviceId → các ngày có bản ghi hợp lệ
  for (const r of records) {
    if (!r.date || r.date > date || !hasEntryRecord(r)) continue;
    const l = byDevice.get(r.deviceId);
    if (l) l.push(r.date);
    else byDevice.set(r.deviceId, [r.date]);
  }
  const enteredSince = (id: string, from: string) => (byDevice.get(id) ?? []).some((d) => d >= from);

  const cells = new Map<string, { area: string; group: string; list: SummaryDevice[] }>();
  const put = (area: string, g: string, d: SummaryDevice) => {
    const k = `${area}|${g}`;
    const c = cells.get(k) ?? { area, group: g, list: [] };
    c.list.push(d);
    cells.set(k, c);
  };
  for (const d of devices) {
    if (!d.active) continue;
    const isMnk = !!mnkShiftOf(d.area, d.name);
    if (group === MNK_SHIFT_GROUP) {
      if (isMnk) put(d.area, MNK_SHIFT_GROUP, d);
      continue;
    }
    if (isMnk) continue; // 14 MNK nhập ở màn riêng — như app cũ
    const own = (d.measureGroups.length ? d.measureGroups : [DEFAULT_MEASURE_GROUP]).filter((g) => KNOWN_GROUPS.has(g));
    for (const g of own) if (group === "all" || group === g) put(d.area, g, d);
  }

  const order = (g: string) => MEASURE_GROUPS.findIndex((x) => x.id === g);
  const all = [...cells.values()].sort((a, b) => cmp(a.area, b.area) || order(a.group) - order(b.group));
  const areas = [...new Set(all.map((c) => c.area))];
  const rows: SummaryRow[] = [];
  for (const c of all) {
    if (input.area && input.area !== "all" && c.area !== input.area) continue;
    const due = groupDueDate(c.group, date);
    if (!due) continue;
    const missing = c.list.filter((d) => !enteredSince(d.id, due)).map((d) => ({ id: d.id, name: d.name }));
    rows.push({
      area: c.area, group: c.group, groupLabel: SUMMARY_GROUP_LABELS[c.group] ?? c.group, due,
      total: c.list.length, entered: c.list.length - missing.length, missing, complete: missing.length === 0,
    });
  }
  const areaState = new Map<string, boolean>();
  for (const r of rows) areaState.set(r.area, (areaState.get(r.area) ?? true) && r.complete);
  const devicesN = rows.reduce((s, r) => s + r.total, 0);
  const entered = rows.reduce((s, r) => s + r.entered, 0);
  return {
    date, group, rows, areas,
    totals: {
      areas: areaState.size,
      areasComplete: [...areaState.values()].filter(Boolean).length,
      devices: devicesN, entered, missing: devicesN - entered,
      percent: devicesN ? Math.round((entered / devicesN) * 100) : 0,
    },
  };
}
