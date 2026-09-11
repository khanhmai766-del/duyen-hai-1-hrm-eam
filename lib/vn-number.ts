/**
 * ĐỌC SỐ NGƯỜI DÙNG GÕ THEO KIỂU VIỆT NAM: dấu CHẤM tách hàng nghìn, dấu PHẨY là phần lẻ.
 *
 *   "10.860"    → 10860      (mười nghìn tám trăm sáu mươi)
 *   "10,860"    → 10.86      (mười phẩy tám sáu)
 *   "10.860,5"  → 10860.5
 *   "10860"     → 10860
 *
 * Bản cũ ở các ô khối lượng hóa chất chỉ `replace(",", ".")` rồi `Number()`, nên "10.860"
 * bị hiểu thành 10,86 — một chuyến xe PAC 10 tấn ghi vào sổ còn chưa tới 11 kg (phiếu
 * HC-4 tháng 09/2026).
 *
 * CỐ Ý TỪ CHỐI số mơ hồ thay vì đoán: "10.5" không phải cách viết hàng nghìn hợp lệ (nhóm
 * sau dấu chấm phải đủ 3 chữ số), đoán thành 105 hay 10,5 đều có thể sai tới 10 lần. Trả
 * `null` để ô nhập báo lỗi và người dùng gõ lại cho rõ.
 */
export function parseVnNumber(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const text = input.replace(/\s/g, "");
  if (!text) return null;
  // Phần nguyên: hoặc liền một khối số, hoặc nhóm 1–3 chữ số rồi các nhóm ".xxx" đủ 3 chữ số.
  // Phần lẻ: tuỳ chọn, sau ĐÚNG MỘT dấu phẩy.
  if (!/^-?(\d+|\d{1,3}(\.\d{3})+)(,\d+)?$/.test(text)) return null;
  const value = Number(text.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/** Thông báo dùng chung khi ô nhập số không đọc được. */
export const VN_NUMBER_HINT = "Dùng dấu chấm tách hàng nghìn, dấu phẩy cho phần lẻ — vd 10.860 hoặc 10,86";

/** Hiện số theo kiểu Việt Nam, giữ tối đa `digits` chữ số lẻ, không làm tròn thành số nguyên. */
export function formatVnNumber(value: number | null | undefined, digits = 3) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return value.toLocaleString("vi-VN", { maximumFractionDigits: digits });
}
