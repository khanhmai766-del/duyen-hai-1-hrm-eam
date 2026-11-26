import { SHIFT_WINDOWS, VIB_VALUE_COUNT, type ShiftId } from "./constants";

const NUMBER_RE = /^(\d+(\.\d*)?|\.\d+)$/;

/** "" → null; chỉ nhận số không âm, dấu chấm thập phân (giữ nguyên 0). Trả undefined nếu sai định dạng. */
export function parseCell(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : undefined;
  const text = String(raw).trim();
  if (!text) return null;
  return NUMBER_RE.test(text) ? Number(text) : undefined;
}

export const CELL_ERROR = "Thông số phải là số không âm; dùng dấu chấm thập phân (ví dụ 14.6)";

/** "530"→"05:30", "1430"→"14:30", "HH:mm" hợp lệ giữ nguyên; rỗng → "". Sai định dạng → null. */
export function normalizeTime(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  let h: number;
  let m: number;
  const colon = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (colon) {
    h = Number(colon[1]);
    m = Number(colon[2]);
  } else if (/^\d{3,4}$/.test(text)) {
    const p = text.padStart(4, "0");
    h = Number(p.slice(0, 2));
    m = Number(p.slice(2));
  } else return null;
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400e3).toISOString().slice(0, 10);
}

/** Ca và ngày ca của một thời điểm (giờ Việt Nam, độc lập múi giờ trình duyệt). Trước 06:00 ⇒ ca đêm của hôm trước. */
export function vnShift(now: Date = new Date()): { date: string; shift: ShiftId } {
  const t = new Date(now.getTime() + 7 * 3600e3);
  const h = t.getUTCHours();
  let date = t.toISOString().slice(0, 10);
  if (h < 6) date = addDays(date, -1);
  return { date, shift: h >= 6 && h < 14 ? "sang" : h >= 14 && h < 22 ? "chieu" : "dem" };
}

export function vnToday(now: Date = new Date()) {
  return new Date(now.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
}

/** Giờ "HH:mm" có nằm trong cửa sổ ca không (ca đêm: ≥22:00 hoặc <06:00). */
export function timeInShift(time: string, shift: ShiftId) {
  const h = Number(time.slice(0, 2));
  const { start, end } = SHIFT_WINDOWS[shift];
  return shift === "dem" ? h >= start || h < end : h >= start && h < end;
}

/** Ngày lịch thật của giờ đo: ca đêm, giờ < 06 ⇒ ngày kế tiếp ngày ca. */
export function actualDateOf(date: string, shift: ShiftId, time: string): string | null {
  if (!time) return null;
  return shift === "dem" && Number(time.slice(0, 2)) < 6 ? addDays(date, 1) : date;
}

export function emptyValues(): (number | null)[] {
  return Array.from({ length: VIB_VALUE_COUNT }, () => null);
}

/** Số đọc được từ ô (số, hoặc chuỗi bản Excel cũ kiểu "36 °C"); còn lại null. */
export function cellNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const m = /^\s*(\d+(?:[.,]\d+)?)\s*(?:[A-Za-z°µ%].*)?$/.exec(value);
    return m ? Number(m[1].replace(",", ".")) : null;
  }
  return null;
}

/** Bỏ dấu + chữ thường (đ→d) để so khớp tên tiếng Việt. */
export function foldVn(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase();
}
