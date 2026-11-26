// Đọc ô số liệu (Excel lịch sử có thể là chuỗi). Port từ vibracontrol/measure-values.js (readCell, cellNum).
// Giá trị gốc không bị sửa; chỉ đọc kèm cờ. Cờ: so | chu_so | giai_ma_ngay | giai_ma_gio | khong_do | can_xac_nhan

export type CellFlag = "so" | "chu_so" | "giai_ma_ngay" | "giai_ma_gio" | "khong_do" | "can_xac_nhan";
export interface CellRead {
  value: number | null;
  flag: CellFlag;
}

// measure-values.js:cellFlagText
export const CELL_FLAG_TEXT: Record<string, string> = {
  chu_so: "Số lưu dạng chữ",
  giai_ma_ngay: "Giải mã: Excel đã đổi số thành ngày (d.m → d,m)",
  giai_ma_gio: "Giải mã: Excel đã đổi số thành giờ (phần ngày)",
  can_xac_nhan: "Không đọc được — cần người nhập xác nhận",
};

// measure-values.js:readCell
export function readCell(v: unknown): CellRead {
  if (v === null || v === undefined) return { value: null, flag: "khong_do" };
  if (typeof v === "number") return Number.isFinite(v) ? { value: v, flag: "so" } : { value: null, flag: "can_xac_nhan" };
  const s = String(v).trim();
  if (s === "" || /^[-–]$/.test(s)) return { value: null, flag: "khong_do" };
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    if (Number(m[1]) <= 1900) {
      if (m[4] === undefined) return { value: null, flag: "can_xac_nhan" };
      const serial = (Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - Date.UTC(1899, 11, 30)) / 864e5;
      return { value: Math.round(serial * 1e6) / 1e6, flag: "giai_ma_gio" };
    }
    return { value: Number(Number(m[3]) + "." + Number(m[2])), flag: "giai_ma_ngay" };
  }
  m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return { value: Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + (+m[3] || 0)) / 864 * 100) / 1e4, flag: "giai_ma_gio" };
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:(°C|°|A|mm\/s|µm|um)\s*(?:\(.*\))?)?$/i);
  if (m) return { value: Number(m[1].replace(",", ".")), flag: "chu_so" };
  if (/^[^\d]*$/.test(s)) return { value: null, flag: "khong_do" };
  return { value: null, flag: "can_xac_nhan" };
}

// measure-values.js:cellNum
export const cellNum = (v: unknown): number | null => readCell(v).value;

// app.js:num
export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
// app.js:maximum
export const maximum = (v: unknown[]): number | null => {
  const n = v.filter(isNum);
  return n.length ? Math.max(...n) : null;
};
