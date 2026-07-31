const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

/**
 * Từ ngày này hằng tháng, lịch điểm danh của THÁNG KẾ TIẾP được mở sẵn để phân
 * xưởng bố trí ca trước. Trước mốc đó chỉ thao tác được trong tháng hiện tại.
 */
export const NEXT_MONTH_OPEN_DAY = 25;

type DateParts = { year: number; month: number; day: number };

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Ngày/tháng/năm theo giờ Việt Nam — dùng chung để client và server không lệch mốc. */
function vietnamParts(now: Date): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

/** `month` tính từ 1. */
function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Chuẩn hoá về "YYYY-MM-DD" theo giờ Việt Nam để so sánh chuỗi. */
export function attendanceDateKey(value: string | Date): string {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    const parts = vietnamParts(parsed);
    return isoDate(parts.year, parts.month, parts.day);
  }
  const parts = vietnamParts(value);
  return isoDate(parts.year, parts.month, parts.day);
}

/**
 * Khoảng ngày được phép điểm danh / thu hồi / duyệt ca: luôn gồm trọn tháng
 * hiện tại, và mở thêm trọn tháng kế tiếp kể từ ngày {@link NEXT_MONTH_OPEN_DAY}.
 */
export function attendanceWindow(now: Date = new Date()) {
  const { year, month, day } = vietnamParts(now);
  const nextMonthOpen = day >= NEXT_MONTH_OPEN_DAY;
  const endYear = nextMonthOpen && month === 12 ? year + 1 : year;
  const endMonth = nextMonthOpen ? (month === 12 ? 1 : month + 1) : month;
  return {
    min: isoDate(year, month, 1),
    max: isoDate(endYear, endMonth, lastDayOfMonth(endYear, endMonth)),
    nextMonthOpen,
    currentMonth: { year, month },
    endMonth: { year: endYear, month: endMonth },
  };
}

export function isDateInAttendanceWindow(value: string | Date, now: Date = new Date()) {
  const key = attendanceDateKey(value);
  if (!key) return false;
  const { min, max } = attendanceWindow(now);
  return key >= min && key <= max;
}

export function attendanceWindowMessage(now: Date = new Date()) {
  const { nextMonthOpen, currentMonth, endMonth } = attendanceWindow(now);
  if (nextMonthOpen) {
    return `Chỉ được điểm danh, thu hồi hoặc duyệt ca trong tháng ${currentMonth.month}/${currentMonth.year} và tháng ${endMonth.month}/${endMonth.year}.`;
  }
  return `Chỉ được điểm danh, thu hồi hoặc duyệt ca trong tháng hiện tại. Lịch tháng sau mở từ ngày ${NEXT_MONTH_OPEN_DAY}.`;
}
