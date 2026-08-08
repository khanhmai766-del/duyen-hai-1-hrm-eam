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
