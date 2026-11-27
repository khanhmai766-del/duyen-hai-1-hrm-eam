/**
 * Nhập số trên điện thoại. Bàn phím số (`inputMode="decimal"`) của máy đặt tiếng Việt hiện dấu PHẨY thập phân,
 * trong khi web chỉ nhận dấu chấm: trên màn cảm ứng đổi phẩy thành chấm thay vì từ chối; máy tính giữ nguyên
 * (ô nhận phẩy ⇒ báo lỗi như bản cũ).
 */
export const isTouchInput = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

/** Màn cảm ứng: "14,6" → "14.6". Máy tính: giữ nguyên. */
export const touchDecimal = (value: string) => (value.includes(",") && isTouchInput() ? value.replace(/,/g, ".") : value);
