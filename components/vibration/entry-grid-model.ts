import { MEASURE_GROUP_RANGES, VIB_LABELS, VIB_VALUE_COUNT } from "@/lib/vibration/constants";
import { CELL_ERROR, normalizeTime, parseCell } from "@/lib/vibration/parse";
import { statusFor, type VibStatus } from "@/lib/vibration/severity";
import type { VibrationDeviceDto, VibrationRecordDto, VibrationRecordInput } from "@/lib/vibration/types";

/** Một dòng nhập của lưới: mọi ô giữ dạng chuỗi như người dùng gõ. */
export interface RowDraft {
  power: string;
  time: string;
  note: string;
  v: string[];
}
export type GridCol = "power" | "time" | "note" | number;
export type CellUpdate = { id: string; col: GridCol; value: string };

export const BLANK_ROW: RowDraft = { power: "", time: "", note: "", v: Array.from({ length: VIB_VALUE_COUNT }, () => "") };

export function rowFromRecord(r: VibrationRecordDto): RowDraft {
  return {
    power: r.power == null ? "" : String(r.power),
    time: r.measureTime ?? "",
    note: r.note ?? "",
    v: Array.from({ length: VIB_VALUE_COUNT }, (_, i) => {
      const x = r.values?.[i];
      return typeof x === "number" ? String(x) : "";
    }),
  };
}

export function applyUpdate(row: RowDraft, col: GridCol, value: string): RowDraft {
  if (col === "power" || col === "time" || col === "note") return { ...row, [col]: value };
  const v = row.v.slice();
  v[col] = value;
  return { ...row, v };
}

/** Ô thứ i của thiết bị có được bật theo `measurementConfig` không. */
export function enabledIdx(d: VibrationDeviceDto, i: number) {
  const g = MEASURE_GROUP_RANGES.find((x) => i >= x.from && i <= x.to);
  return !g || d.measurementConfig?.[g.key]?.enabled !== false;
}

/** Nhãn ngắn cho cột (bỏ tiền tố ĐC-KT… vì đã có tiêu đề nhóm). */
export function shortLabel(i: number) {
  const full = VIB_LABELS[i];
  return i < 3 ? full.replace("Dòng điện ", "") : full.replace(/^(ĐC|QB)-(KT|CT) /, "");
}

export interface ParsedRow {
  item?: VibrationRecordInput;
  error?: string;
  /** Không có số nào và không có nhận xét. */
  empty: boolean;
}

export function parseRow(d: VibrationDeviceDto, row: RowDraft, withPower: boolean): ParsedRow {
  const values: (number | null)[] = [];
  for (let i = 0; i < VIB_VALUE_COUNT; i++) {
    if (!enabledIdx(d, i)) {
      values.push(null);
      continue;
    }
    const n = parseCell(row.v[i]);
    if (n === undefined) return { empty: false, error: `${CELL_ERROR} (ô “${VIB_LABELS[i]}”)` };
    values.push(n);
  }
  const power = parseCell(row.power);
  if (power === undefined) return { empty: false, error: "Công suất phải là số không âm; dùng dấu chấm thập phân" };
  const time = normalizeTime(row.time);
  if (time === null) return { empty: false, error: "Giờ đo không hợp lệ (dùng HH:mm, ví dụ 14:30)" };
  const note = row.note.trim();
  const empty = values.every((v) => v === null) && !note;
  return {
    empty,
    item: { deviceId: d.id, person: "", measureTime: time, values, note, ...(withPower ? { power } : {}) },
  };
}

export type RowStatus = VibStatus | "check" | "noteOnly";

export function rowStatus(d: VibrationDeviceDto, row: RowDraft): RowStatus {
  const vals: (number | null)[] = [];
  for (let i = 0; i < VIB_VALUE_COUNT; i++) {
    if (!enabledIdx(d, i)) {
      vals.push(null);
      continue;
    }
    const n = parseCell(row.v[i]);
    if (n === undefined) return "check";
    vals.push(n);
  }
  const s = statusFor(d.alertConfig, vals);
  return s === "empty" && row.note.trim() ? "noteOnly" : s;
}

export const ROW_STATUS_LABEL: Record<RowStatus, string> = {
  empty: "Chưa nhập", ok: "Bình thường", warn: "Cảnh báo", danger: "Nguy hiểm", stopped: "Máy dừng", off: "Tắt cảnh báo",
  check: "Kiểm tra dữ liệu", noteOnly: "Chỉ có nhận xét",
};
export const ROW_STATUS_CLASS: Record<RowStatus, string> = {
  empty: "bg-slate-100 text-slate-600 ring-slate-200",
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warn: "bg-amber-50 text-amber-700 ring-amber-300",
  danger: "bg-red-50 text-red-700 ring-red-300",
  stopped: "bg-sky-50 text-sky-700 ring-sky-200",
  off: "bg-slate-100 text-slate-500 ring-slate-200",
  check: "bg-orange-50 text-orange-700 ring-orange-300",
  noteOnly: "bg-slate-100 text-slate-600 ring-slate-200",
};

// ---- Nháp trong localStorage (mỗi bảng một khoá) ----
const draftKey = (k: string) => `vibra-entry-draft:${k}`;
export interface StoredDraft {
  person: string | null;
  rows: Record<string, RowDraft>;
}

export function loadDraft(k: string): StoredDraft {
  const empty: StoredDraft = { person: null, rows: {} };
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(draftKey(k));
    if (!raw) return empty;
    const p = JSON.parse(raw) as { person?: unknown; rows?: Record<string, Partial<RowDraft>> };
    const rows: Record<string, RowDraft> = {};
    for (const [id, r] of Object.entries(p.rows ?? {})) {
      if (!r || !Array.isArray(r.v)) continue;
      rows[id] = {
        power: String(r.power ?? ""), time: String(r.time ?? ""), note: String(r.note ?? ""),
        v: Array.from({ length: VIB_VALUE_COUNT }, (_, i) => String(r.v?.[i] ?? "")),
      };
    }
    return { person: typeof p.person === "string" ? p.person : null, rows };
  } catch {
    return empty;
  }
}

export function storeDraft(k: string, draft: StoredDraft) {
  try {
    if (typeof window === "undefined") return;
    if (!draft.person && Object.keys(draft.rows).length === 0) window.localStorage.removeItem(draftKey(k));
    else window.localStorage.setItem(draftKey(k), JSON.stringify(draft));
  } catch {
    /* localStorage có thể bị chặn: bỏ qua, trang vẫn dùng được */
  }
}

export const fmtDate = (d: string) => d.split("-").reverse().join("/");

// ---- Quy tắc nhập của web độ rung cũ (weekly.js) ----
export const OLD_CELL_ERROR = "Thông số phải là số không âm; dùng dấu chấm thập phân (ví dụ 14.6), không dùng dấu phẩy.";
export const COMMA_ERROR = "Dùng dấu chấm thập phân (14.6), không nhập dấu phẩy.";
export const TIME_ERROR = "Giờ đo phải theo 24h: nhập 3–4 số (530, 0530, 1430) hoặc HH:mm; giờ 00–23, phút 00–59, không dùng AM/PM.";
export const NUMBER_PATTERN = "(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)";
export const TIME_PATTERN = "(?:[0-9]{3,4}|(?:[01][0-9]|2[0-3]):[0-5][0-9])";

/** Gõ số tự chèn ":" (0930 → 09:30; 530 → 5:30 rồi rời ô → 05:30). Giống vcMaskTime của bản cũ. */
export function maskTime(v: string) {
  const s = String(v || "");
  if (s.includes(":")) {
    const [h, m = ""] = s.split(":");
    return h.replace(/\D/g, "").slice(0, 2) + ":" + m.replace(/\D/g, "").slice(0, 2);
  }
  const d = s.replace(/\D/g, "").slice(0, 4);
  if (d.length === 4) return d.slice(0, 2) + ":" + d.slice(2);
  if (d.length === 3) return Number(d.slice(0, 2)) > 23 ? d[0] + ":" + d.slice(1) : d.slice(0, 2) + ":" + d.slice(2);
  return d;
}
/** Rời ô giờ: 5:3 → 05:03, 530 → 05:30 (vcPadTime). */
export function padTime(v: string) {
  const t = String(v || "").trim();
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(t);
  if (m && m[1].length === 2 && m[2].length === 1) return v;
  if (m) return m[1].padStart(2, "0") + ":" + m[2].padStart(2, "0");
  const d = /^(\d{3,4})$/.exec(t);
  return d ? d[1].padStart(4, "0").replace(/^(\d\d)/, "$1:") : v;
}

/** Nhãn trạng thái hàng như bản cũ (Chưa nhập / Bình thường / Cảnh báo / Nguy hiểm). */
export const OLD_STATUS_LABEL: Record<RowStatus, string> = {
  empty: "Chưa nhập", ok: "Bình thường", warn: "Cảnh báo", danger: "Nguy hiểm", stopped: "Máy dừng", off: "Tắt cảnh báo",
  check: "Kiểm tra dữ liệu", noteOnly: "Chưa nhập",
};

/** Số `data-col` như bản cũ: công suất 4, giờ đo 5, ô đo i → i+6, nhận xét 29. */
export const colNo = (col: GridCol) => (col === "power" ? 4 : col === "time" ? 5 : col === "note" ? 29 : col + 6);
export const colField = (col: GridCol) => (typeof col === "number" ? `v${col}` : col === "time" ? "measureTime" : col);
export function fieldCol(field: string | undefined): GridCol | null {
  if (field === "power" || field === "note") return field;
  if (field === "measureTime") return "time";
  const m = /^v(\d+)$/.exec(field ?? "");
  return m ? Number(m[1]) : null;
}

/** Nhãn cột ngắn kiểu bảng MNK: "ĐC-KT Vận tốc X (mm/s)" → ["Vận tốc X", "mm/s"]. */
export function splitLabel(i: number): [string, string] {
  const m = /^(?:(?:ĐC|QB)-(?:KT|CT) |Dòng điện )?(.*) \((.*)\)$/.exec(VIB_LABELS[i]);
  return m ? [m[1], m[2]] : [VIB_LABELS[i], ""];
}
