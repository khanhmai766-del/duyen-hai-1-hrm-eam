import { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { formatPermitNumber, PERMIT_KINDS, type PermitMember } from "@/lib/work-permits";
import { parsePermitMembers, permitInstant, permitText } from "@/lib/server/work-permits";

export function validateSessionTime(value: Date, lowerBound: Date, now = new Date()) {
  if (value < lowerBound) throw fail("Thời điểm ghi nhận không được trước mốc bắt đầu tương ứng");
  if (value > now) throw fail("Chỉ ghi nhận thời điểm đã thực tế diễn ra, không nhập thời điểm tương lai");
}
export function sessionOverlapWhere(commanderId: string, openedAt: Date): Prisma.WorkPermitSessionWhereInput {
  // Lần đang mở có khoảng thời gian [openedAt, +vô cùng). Hai lần tiếp giáp được phép.
  return { commanderId, OR: [{ endedAt: null }, { endedAt: { gt: openedAt } }] };
}
export function readSessionOpen(body: Record<string, unknown>) {
  const commanderId = permitText(body, "commanderId", 100);
  const authorizerName = permitText(body, "authorizerName");
  const openedAt = permitInstant(body, "openedAt");
  const members = parsePermitMembers(body.members);
  const workerCount = 1 + members.length;
  if (!commanderId || !authorizerName || !openedAt) throw fail("Vui lòng chọn CHTT, nhập người cho phép và thời điểm mở lần làm việc");
  return { commanderId, authorizerName, openedAt, members, workerCount };
}
export async function resolveSessionMembers(tx: Prisma.TransactionClient, members: PermitMember[]) {
  const ids = members.flatMap(m => m.personId ? [m.personId] : []);
  const people = ids.length ? await tx.workPermitPerson.findMany({ where: { id: { in: ids }, isActive: true } }) : [];
  const byId = new Map(people.map(p => [p.id, p]));
  return members.map(m => {
    if (!m.personId) return m;
    const p = byId.get(m.personId);
    if (!p) throw fail(`Nhân viên ${m.name} không còn hoạt động trong danh bạ. Vui lòng chọn lại.`);
    return { personId: p.id, code: p.code, name: p.name, company: p.company };
  });
}
export async function assertCommanderFree(tx: Prisma.TransactionClient, commanderId: string, openedAt: Date) {
  const conflict = await tx.workPermitSession.findFirst({
    where: sessionOverlapWhere(commanderId, openedAt),
    include: { permit: { select: { number: true, year: true, kind: true, content: true } } },
    orderBy: { openedAt: "asc" },
  });
  if (!conflict) return;
  const fmt = (v: Date) => v.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  throw fail(`CHTT ${conflict.commanderName} (${conflict.commanderCode}) trùng thời gian với PCT ${formatPermitNumber(conflict.permit)}, sổ ${PERMIT_KINDS[conflict.permit.kind as keyof typeof PERMIT_KINDS]}. Lần làm việc: ${fmt(conflict.openedAt)} → ${conflict.endedAt ? fmt(conflict.endedAt) : "chưa ghi nhận kết thúc"}. Công việc: ${conflict.permit.content.slice(0, 120)}. Kiểm tra thời gian hoặc kết thúc lần làm việc đang mở trước khi tiếp tục.`, 409);
}
