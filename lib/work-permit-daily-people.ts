import { samePermitWorker } from "@/lib/work-permit-presence";
import type { PermitMember } from "@/lib/work-permits";

/** Ngày lịch Việt Nam, không phụ thuộc múi giờ của máy chủ. */
export function permitWorkingDay(now: Date = new Date()) {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

export function permitWorkingDayBounds(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new RangeError("Ngày không hợp lệ");
  const start = new Date(`${day}T00:00:00+07:00`);
  if (!Number.isFinite(start.getTime()) || permitWorkingDay(start) !== day) throw new RangeError("Ngày không hợp lệ");
  return { start, end: new Date(start.getTime() + 86400_000) };
}

export interface DailyWorkingSession {
  commanderId: string | null; commanderCode: string; commanderName: string; company: string;
  members: unknown; openedAt: Date; endedAt: Date | null;
}

/**
 * Người từng làm trong khoảng [0h, 0h ngày sau): gồm CHTT và nhân viên có lượt VÀO giao với ngày.
 * Người chưa VÀO (attendance: []) không tính; dữ liệu cũ thiếu attendance tính theo lần làm việc.
 * Khử trùng giữa các PCT/lượt vào/ra bằng cùng quy tắc nhận diện nhân sự đang làm việc.
 *
 * `onCount` (tuỳ chọn): gọi cho MỖI lần một người được tính ở một lần làm việc — kể cả lần trùng — với bản ghi
 * đại diện (người tìm thấy đầu tiên), để biết người đó làm ở những PCT nào và có làm CHTT không.
 */
export function dailyWorkingPeople<S extends DailyWorkingSession>(sessions: S[], day: string, now: Date = new Date(),
  onCount?: (person: PermitMember, session: S, asCommander: boolean) => void): PermitMember[] {
  const { start, end } = permitWorkingDayBounds(day);
  const until = Math.min(end.getTime(), now.getTime());
  const found: PermitMember[] = [];
  const add = (member: PermitMember, session: S, asCommander: boolean) => {
    if (!member.name) return;
    let person = found.find(other => samePermitWorker(member, other));
    if (!person) found.push(person = member);
    onCount?.(person, session, asCommander);
  };
  for (const session of sessions) {
    const sessionEnd = Math.min(session.endedAt?.getTime() ?? until, until);
    const overlaps = (from: number, to: number) => Number.isFinite(from) && Number.isFinite(to)
      && from < until && to > start.getTime() && to > from;
    if (!overlaps(session.openedAt.getTime(), sessionEnd)) continue;
    add({ personId: session.commanderId ?? undefined, code: session.commanderCode, name: session.commanderName, company: session.company }, session, true);
    if (!Array.isArray(session.members)) continue;
    for (const value of session.members) {
      if (!value || typeof value !== "object" || typeof value.name !== "string" || typeof value.company !== "string") continue;
      const member = value as PermitMember;
      const worked = member.attendance == null || (Array.isArray(member.attendance) && member.attendance.some(visit =>
        visit && overlaps(Math.max(new Date(visit.in).getTime(), session.openedAt.getTime()),
          Math.min(visit.out ? new Date(visit.out).getTime() : sessionEnd, sessionEnd))));
      if (worked) add(member, session, false);
    }
  }
  return found;
}
