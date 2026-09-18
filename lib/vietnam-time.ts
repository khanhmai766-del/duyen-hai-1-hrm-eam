export const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Biên [đầu ngày, đầu ngày kế tiếp) theo UTC+7, không phụ thuộc timezone máy chủ. */
export function vietnamDayWindow(now: Date = new Date(), dayOffset = 0) {
  const shifted = new Date(now.getTime() + VIETNAM_OFFSET_MS);
  const localMidnightAsUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + dayOffset,
  );
  const start = new Date(localMidnightAsUtc - VIETNAM_OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

export function vietnamDayKey(value: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function formatVietnamDate(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VIETNAM_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

export function formatVietnamDateTime(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VIETNAM_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);
}
