import { prisma } from "@/lib/prisma";
import { lastVisit } from "@/lib/work-permit-attendance";
import { presentMembers, samePermitWorker } from "@/lib/work-permit-presence";
import { isSessionCommander, type PermitKind, type PermitMember } from "@/lib/work-permits";

export interface WorkingPerson {
  name: string; code: string; personId?: string;
  /** Đơn vị theo hồ sơ hiện tại (đổi tên đơn vị vẫn khớp); không còn hồ sơ thì theo chữ đã ghi ở phiếu. */
  company: string; phone: string;
  role: "CHTT" | "MEMBER";
  /** Lượt vào gần nhất; CHTT / người chưa theo dõi vào-ra lấy giờ mở lần làm việc. */
  since: Date;
  permit: { id: string; number: string; nkvhNumber: string | null; year: number; kind: PermitKind; position: string | null; content: string; location: string };
}

/**
 * Người đang làm việc ngay lúc gọi: CHTT + nhân viên chưa quét RA của mọi lần làm việc đang mở — cùng định
 * nghĩa với chặn một người vào hai phiếu (lib/server/work-permit-presence.ts). Một người chỉ tính một lần.
 * Dùng chung cho cột "Đang làm việc" của bảng đơn vị và file Excel theo cương vị, để hai số luôn khớp.
 */
export async function loadWorkingPeople(): Promise<WorkingPerson[]> {
  const sessions = await prisma.workPermitSession.findMany({ where: { endedAt: null }, orderBy: { openedAt: "asc" },
    select: { commanderId: true, commanderCode: true, commanderName: true, company: true, members: true, openedAt: true,
      permit: { select: { id: true, number: true, nkvhNumber: true, year: true, kind: true, position: true, content: true, location: true } } } });
  const found: Array<{ member: PermitMember; role: WorkingPerson["role"]; since: Date; permit: WorkingPerson["permit"] }> = [];
  for (const { members, openedAt, permit, ...session } of sessions) {
    const commander: PermitMember = { personId: session.commanderId ?? undefined, code: session.commanderCode, name: session.commanderName, company: session.company };
    const entries = [{ member: commander, role: "CHTT" as const, since: openedAt },
      ...presentMembers(members).filter(member => !isSessionCommander(member, session)).map(member => {
        const visit = lastVisit(member);
        return { member, role: "MEMBER" as const, since: visit ? new Date(visit.in) : openedAt };
      })];
    for (const entry of entries) {
      if (!found.some(other => samePermitWorker(entry.member, other.member))) found.push({ ...entry, permit: { ...permit, kind: permit.kind as PermitKind } });
    }
  }
  const ids = found.flatMap(entry => entry.member.personId ? [entry.member.personId] : []);
  const profiles = new Map((ids.length ? await prisma.workPermitPerson.findMany({ where: { id: { in: ids } }, select: { id: true, company: true, phone: true } }) : [])
    .map(person => [person.id, person]));
  return found.map(({ member, role, since, permit }) => {
    const profile = member.personId ? profiles.get(member.personId) : undefined;
    return { name: member.name, code: member.code ?? "", personId: member.personId, company: profile?.company || member.company, phone: profile?.phone ?? "", role, since, permit };
  });
}
