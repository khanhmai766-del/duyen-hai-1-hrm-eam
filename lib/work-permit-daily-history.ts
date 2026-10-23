import { dailyWorkingPeople, permitWorkingDayBounds, type DailyWorkingSession } from "@/lib/work-permit-daily-people";
import type { PermitMember } from "@/lib/work-permits";

/** Khoảng xem lịch sử dài nhất (ngày) — đủ một đợt đại tu, và giữ một lần tải ở mức vài nghìn lần làm việc. */
export const DAILY_HISTORY_MAX_DAYS = 62;

/** Cộng/trừ ngày lịch trên chuỗi YYYY-MM-DD (tính theo UTC nên không lệch vì múi giờ máy). */
export function shiftWorkingDay(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** Danh sách ngày từ `from` đến `to` (gồm cả hai đầu); ném RangeError khi sai định dạng, ngược chiều hoặc quá dài. */
export function permitWorkingDayRange(from: string, to: string) {
  permitWorkingDayBounds(from); permitWorkingDayBounds(to);
  if (from > to) throw new RangeError("Ngày bắt đầu phải trước ngày kết thúc");
  const days: string[] = [];
  for (let day = from; day <= to; day = shiftWorkingDay(day, 1)) {
    days.push(day);
    if (days.length > DAILY_HISTORY_MAX_DAYS) throw new RangeError(`Chỉ xem được tối đa ${DAILY_HISTORY_MAX_DAYS} ngày một lần`);
  }
  return days;
}

/** "23/10" và thứ trong tuần ("T6", "CN") của một ngày YYYY-MM-DD. */
export function workingDayLabel(day: string) {
  const [, month, date] = day.split("-");
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return { short: `${date}/${month}`, full: `${date}/${month}/${day.slice(0, 4)}`, weekday: weekday === 0 ? "CN" : `T${weekday + 1}`, weekend: weekday === 0 || weekday === 6 };
}

/** Một người đã làm việc trong ngày: có làm CHTT ở lần nào không và đã làm ở những PCT nào. */
export interface DailyWorker extends PermitMember { commander: boolean; permitIds: string[] }

/**
 * Người làm việc trong một ngày, kèm vai trò và các PCT — cùng cách đếm với cột "Làm việc trong ngày"
 * (dailyWorkingPeople), chỉ ghi thêm thông tin mỗi lần một người được tính.
 */
export function dailyWorkers<S extends DailyWorkingSession & { permit: { id: string } }>(sessions: S[], day: string, now: Date = new Date()): DailyWorker[] {
  const { start, end } = permitWorkingDayBounds(day);
  // Lọc thô các lần làm việc chạm ngày này cho nhanh; điều kiện chính xác nằm trong dailyWorkingPeople.
  const touching = sessions.filter(session => session.openedAt < end && (!session.endedAt || session.endedAt > start));
  const extra = new Map<PermitMember, { commander: boolean; permitIds: Set<string> }>();
  const people = dailyWorkingPeople(touching, day, now, (person, session, asCommander) => {
    const info = extra.get(person) ?? { commander: false, permitIds: new Set<string>() };
    info.commander ||= asCommander;
    info.permitIds.add(session.permit.id);
    extra.set(person, info);
  });
  return people.map(person => ({ ...person, commander: extra.get(person)?.commander ?? false, permitIds: [...(extra.get(person)?.permitIds ?? [])] }));
}

/** Đếm theo đơn vị; `companyOf` cho đơn vị theo hồ sơ danh bạ hiện tại (giống bảng đơn vị). */
export function countWorkersByCompany(workers: DailyWorker[], companyOf: (worker: DailyWorker) => string) {
  const byCompany: Record<string, number> = {};
  for (const worker of workers) {
    const company = companyOf(worker);
    byCompany[company] = (byCompany[company] ?? 0) + 1;
  }
  return byCompany;
}
