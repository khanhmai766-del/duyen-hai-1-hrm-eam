/**
 * Mốc thời gian của module PCCC — dùng chung cho lớp nghiệp vụ (`pccc-service`) và job
 * chuyển kỳ (`pccc-rollover`). Tách riêng để hai file đó khỏi phải import lẫn nhau.
 *
 * Mọi mốc tính theo GIỜ VIỆT NAM, không theo giờ máy chủ: máy chủ chạy UTC thì 23:30
 * ngày 31/08 giờ VN vẫn đang là 16:30 ngày 31/08 UTC — lệch múi giờ ở đây là chốt nhầm
 * tháng, hoặc mở kỳ mới sớm/muộn một ngày.
 */
const TIMEZONE = "Asia/Ho_Chi_Minh";

export type PcccClock = { year: number; month: number; day: number; hour: number; lastDayOfMonth: number };

export function vietnamClock(now = new Date()): PcccClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  return {
    year,
    month,
    day: Number(parts.day),
    hour: Number(parts.hour),
    // Ngày 0 của tháng sau = ngày cuối của tháng này; Date.UTC tự xử lý năm nhuận.
    lastDayOfMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}

export function periodLabelOf(year: number, month: number) {
  return `T${String(month).padStart(2, "0")}.${year}`;
}

/** Số thứ tự tháng tuyệt đối — so sánh kỳ mà không phải xử lý mốc giao năm. */
export function monthIndex(year: number, month: number) {
  return year * 12 + month;
}

export function isLastDayOfMonth(clock: PcccClock) {
  return clock.day === clock.lastDayOfMonth;
}

/**
 * CỬA SỔ CHUYỂN KỲ — khoảng ngày nút "Chuyển kỳ" được hiện (chốt với nghiệp vụ
 * 2026-08-12): 3 ngày cuối tháng cũ + 2 ngày đầu tháng mới. Tháng 8 (31 ngày) thì hiện
 * từ 29/8, sang 3/9 là ẩn.
 *
 * Có cửa sổ vì việc chuyển kỳ là việc CỦA CUỐI THÁNG và không hoàn tác được (kỳ cũ
 * thành chỉ đọc, kỳ quá hạn bị xoá khỏi DB). Để nút phơi quanh năm thì sớm muộn cũng có
 * người bấm nhầm giữa tháng. Vài ngày đầu tháng vẫn giữ nút để còn chạy tay khi job tự
 * động lỗi đúng đêm giao tháng.
 *
 * Tính theo GIỜ VN như mọi mốc khác trong file này.
 */
export const ROLLOVER_DAYS_BEFORE_END = 3;
export const ROLLOVER_DAYS_AFTER_START = 2;

export function isRolloverWindow(clock: PcccClock) {
  const nearEnd = clock.day > clock.lastDayOfMonth - ROLLOVER_DAYS_BEFORE_END;
  const earlyMonth = clock.day <= ROLLOVER_DAYS_AFTER_START;
  return nearEnd || earlyMonth;
}

/** Nhãn kỳ của tháng đang chạy, vd "T08.2026". */
export function currentPeriodLabel(now?: Date) {
  const clock = vietnamClock(now);
  return periodLabelOf(clock.year, clock.month);
}

/**
 * Kỳ của tháng CHƯA TỚI. Kỳ như vậy không được phép ghi: ghi kết quả kiểm tra cho một
 * tháng chưa bắt đầu là sai nghiệp vụ, và nó còn cướp chỗ của kỳ thật khi dọn DB.
 */
export function isFuturePeriod(period: { year: number; monthNo: number }, now?: Date) {
  const clock = vietnamClock(now);
  return monthIndex(period.year, period.monthNo) > monthIndex(clock.year, clock.month);
}

export type PcccPeriodState = "FUTURE" | "CLOSED" | "OPEN";

export function periodStateOf(period: { year: number; monthNo: number; isClosed: boolean }, now?: Date): PcccPeriodState {
  if (isFuturePeriod(period, now)) return "FUTURE";
  return period.isClosed ? "CLOSED" : "OPEN";
}
