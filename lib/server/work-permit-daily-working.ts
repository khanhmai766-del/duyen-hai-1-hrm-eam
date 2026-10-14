import { prisma } from "@/lib/prisma";
import { dailyWorkingPeople, permitWorkingDay, permitWorkingDayBounds } from "@/lib/work-permit-daily-people";
import { formatPermitNumber, type PermitContractorScope } from "@/lib/work-permits";

/**
 * Dùng chung cho bảng nhân sự và báo cáo cuối ngày; truyền ngày hôm trước cho báo cáo lúc 0h.
 * `scope`: chỉ tính lần làm việc của phiếu nhà thầu nhóm đó (Đại tu / SCTX); null = mọi phiếu.
 */
export async function loadDailyWorkingByCompany(day = permitWorkingDay(), now = new Date(), scope: PermitContractorScope | null = null, db = prisma) {
  const { start, end } = permitWorkingDayBounds(day);
  const sessions = await db.workPermitSession.findMany({
    where: { openedAt: { lt: end }, OR: [{ endedAt: null }, { endedAt: { gt: start } }],
      ...(scope ? { permit: { teamType: "CONTRACTOR", contractorScope: scope } } : {}) },
    orderBy: { openedAt: "asc" },
    select: { commanderId: true, commanderCode: true, commanderName: true, company: true, members: true, openedAt: true, endedAt: true,
      permit: { select: { id: true, number: true, year: true } } },
  });
  const people = dailyWorkingPeople(sessions, day, now);
  const ids = people.flatMap(person => person.personId ? [person.personId] : []);
  const profiles = new Map((ids.length ? await db.workPermitPerson.findMany({ where: { id: { in: ids } }, select: { id: true, company: true } }) : [])
    .map(person => [person.id, person.company]));
  const byCompany = new Map<string, number>();
  for (const person of people) {
    const company = (person.personId ? profiles.get(person.personId) : undefined) || person.company;
    byCompany.set(company, (byCompany.get(company) ?? 0) + 1);
  }
  const permitsByCompany = new Map<string, Map<string, string>>();
  const until = Math.min(end.getTime(), now.getTime());
  for (const session of sessions) {
    const stopped = Math.min(session.endedAt?.getTime() ?? until, until);
    if (session.openedAt.getTime() >= until || stopped <= Math.max(start.getTime(), session.openedAt.getTime())) continue;
    const company = (session.commanderId ? profiles.get(session.commanderId) : undefined) || session.company;
    const permits = permitsByCompany.get(company) ?? new Map<string, string>();
    permits.set(session.permit.id, formatPermitNumber(session.permit));
    permitsByCompany.set(company, permits);
  }
  return { day, byCompany, total: people.length, permitsByCompany };
}
