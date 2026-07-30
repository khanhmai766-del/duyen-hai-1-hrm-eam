/** Chuyển đổi dữ liệu thô đọc từ bảng LIMS (portal.tpcduyenhai.com.vn/lims.xhtml).
 *  LIMS hiển thị ngày theo dd/MM/yyyy, còn cột "Ngày trả kết quả" là "HH:mm:ss dd/MM/yyyy".
 *  Dùng chung cho route nhập liệu và tiện ích Chrome (qua bản sao trong bridge-lims.js). */

/** "21/07/2026" → Date lúc 00:00 giờ địa phương. Trả null nếu không đúng định dạng. */
export function parseLimsDate(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  // Chặn ngày không tồn tại kiểu 31/02 — JS tự cuộn sang tháng sau.
  if (date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
  return date;
}

/** "08:54:51 28/07/2026" → Date. Cũng chấp nhận dạng chỉ có ngày. */
export function parseLimsDateTime(value: unknown): Date | null {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  const match = raw.match(/^(\d{1,2}):(\d{2}):(\d{2}) (\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return parseLimsDate(raw);
  const [, hour, minute, second, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  if (date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
  return date;
}

/** Ô rỗng trên LIMS đôi khi là chuỗi trắng hoặc dấu "-": quy về null. */
export function limsText(value: unknown): string | null {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text || text === "-") return null;
  return text;
}
