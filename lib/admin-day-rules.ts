// =====================================================================
// LUẬT ĐĂNG KÝ ĐI HÀNH CHÍNH — lib/admin-day-rules.ts
// Dùng cho client (hiển thị hạn chót, khóa nút). Server đã chặn thật bằng
// luật tương đương trong app/api/hc-groups/checkin/route.ts (trước tối
// thiểu 2 ngày; mốc 16h30 chỉ khóa ngày cách hôm nay đúng 2 ngày).
// Mọi tính toán neo giờ Việt Nam (+07:00)
// để không lệch khi server chạy UTC.
// =====================================================================

export const VN_OFFSET = "+07:00";
export const MIN_DAYS_AHEAD = 2; // gửi trước tối thiểu 2 ngày
export const DEADLINE_HOUR = 16; // trước 16:30
export const DEADLINE_MINUTE = 30;

/** 'YYYY-MM-DD' của một Date theo giờ VN */
export function isoDateVN(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // en-CA cho định dạng YYYY-MM-DD
}

/** Cộng n ngày vào chuỗi 'YYYY-MM-DD' (thuần lịch, không dính timezone) */
export function addDaysIso(dateIso: string, n: number): string {
  const d = new Date(dateIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Hạn chót gửi đăng ký cho ngày D = 16:30 giờ VN của ngày (D - 2) */
export function deadlineFor(dateIso: string): Date {
  const dlDay = addDaysIso(dateIso, -MIN_DAYS_AHEAD);
  const hh = String(DEADLINE_HOUR).padStart(2, "0");
  const mm = String(DEADLINE_MINUTE).padStart(2, "0");
  return new Date(`${dlDay}T${hh}:${mm}:00${VN_OFFSET}`);
}

/** Thứ trong tuần của chuỗi 'YYYY-MM-DD' (0=CN … 6=T7) — thuần lịch, không dính timezone */
export function dayOfWeekIso(dateIso: string): number {
  return new Date(dateIso + "T00:00:00Z").getUTCDay();
}

/** Cuối tuần (Thứ 7, Chủ nhật) — không cho phép đăng ký đi hành chính */
export function isWeekend(dateIso: string): boolean {
  const dow = dayOfWeekIso(dateIso);
  return dow === 0 || dow === 6;
}

export function canRegister(dateIso: string, now: Date = new Date()): boolean {
  return !isWeekend(dateIso) && now.getTime() <= deadlineFor(dateIso).getTime();
}

/** Ngày sớm nhất còn đăng ký được tính từ thời điểm now */
export function earliestRegistrableDate(now: Date = new Date()): string {
  let d = addDaysIso(isoDateVN(now), MIN_DAYS_AHEAD);
  while (!canRegister(d, now)) d = addDaysIso(d, 1);
  return d;
}
