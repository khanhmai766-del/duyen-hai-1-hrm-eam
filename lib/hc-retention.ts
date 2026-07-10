const HC_PREVIOUS_MONTH_KEEP_UNTIL_DAY = 15;
const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

export function vietnamCalendarParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month) - 1,
    day: Number(values.day),
  };
}

export function hcRetentionStartInput(now = new Date()) {
  const current = vietnamCalendarParts(now);
  const keepPreviousMonth = current.day <= HC_PREVIOUS_MONTH_KEEP_UNTIL_DAY;
  const start = new Date(Date.UTC(current.year, current.month - (keepPreviousMonth ? 1 : 0), 1));
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function hcRetentionDescription() {
  return "Lưu trữ trong 1 tháng, giữ tháng trước đến hết ngày 15 hàng tháng.";
}
