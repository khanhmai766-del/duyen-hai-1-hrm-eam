/*
 * Thẻ ra vào cổng & ATVSLĐ của nhân sự nhà thầu — dùng chung client/server.
 *
 * Mã QR in trên thẻ là link web app Google Apps Script của bảng quản lý thẻ, ví dụ
 *   https://script.google.com/macros/s/…/exec?id=1234%2FDH
 * Tham số `id` chính là SỐ THẺ, trùng `WorkPermitPerson.code` → quét là tra ra đúng người, không cần in lại
 * thẻ. Đầu đọc USB/nhập tay có thể đưa số thẻ trơn ("1234/DH") nên cũng nhận.
 */

/** Chuẩn hoá số thẻ giống parsePermitPerson: NFC, bỏ khoảng trắng hai đầu, chữ hoa. */
export function normalizeCardCode(value: string) {
  return value.normalize("NFC").trim().toUpperCase();
}

/** Nội dung QR (link có ?id= hoặc số thẻ trơn) → số thẻ đã chuẩn hoá; không đọc được thì "". */
export function parseCardQr(raw: string) {
  const text = raw.trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) {
    try {
      const id = new URL(text).searchParams.get("id");
      return id ? normalizeCardCode(id) : "";
    } catch {
      return "";
    }
  }
  const code = normalizeCardCode(text);
  return /^[\p{L}\p{N}][\p{L}\p{N}\/._-]{0,79}$/u.test(code) ? code : "";
}

/** Ngày hôm nay theo giờ Việt Nam dạng YYYY-MM-DD (so ngày hết hạn không lệch múi giờ). */
function vnDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Thẻ hết hạn khi ngày hết hạn đã qua (hết hạn ĐÚNG hôm nay vẫn còn dùng trong ngày). */
export function cardExpired(cardExpiresAt: string | Date | null | undefined, now = new Date()) {
  if (!cardExpiresAt) return false;
  const expires = typeof cardExpiresAt === "string" ? new Date(cardExpiresAt) : cardExpiresAt;
  if (Number.isNaN(expires.getTime())) return false;
  return vnDay(expires) < vnDay(now);
}

/** So tên đơn vị không phân biệt hoa thường/dấu cách thừa (tên nhập tay hay lệch một khoảng trắng). */
export function sameCompany(a: string, b: string) {
  const key = (value: string) => value.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("vi");
  return Boolean(a.trim()) && key(a) === key(b);
}
