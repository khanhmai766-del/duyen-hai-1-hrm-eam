import type { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { ATTENDANCE_MIN_STAY_MS, attendanceInside, lastVisit, type AttendanceOutcome, type AttendanceVisit } from "@/lib/work-permit-attendance";
import { sameCompany } from "@/lib/work-permit-card";
import type { PermitMember } from "@/lib/work-permits";
import { permitSnapshot } from "@/lib/server/work-permits";

/** Đọc `WorkPermitSession.members` (Json) an toàn thành mảng thành viên. */
export function sessionMembers(value: Prisma.JsonValue): PermitMember[] {
  return Array.isArray(value) ? value.filter((m): m is PermitMember & Prisma.JsonObject => Boolean(m) && typeof m === "object" && !Array.isArray(m)) as unknown as PermitMember[] : [];
}
export function withEntry(member: PermitMember, at: Date): PermitMember {
  return { ...member, attendance: [{ in: at.toISOString(), out: null }] };
}
export function membersInside(value: Prisma.JsonValue) {
  return sessionMembers(value).filter(attendanceInside);
}
/** Ghi RA lúc `at` cho mọi người còn trong khu vực (kết thúc / bàn giao). Không để giờ ra trước giờ vào. */
export function closeInsideVisits(value: Prisma.JsonValue, at: Date): PermitMember[] {
  return sessionMembers(value).map(member => {
    if (!attendanceInside(member)) return member;
    const visits = member.attendance!.slice();
    const last = visits[visits.length - 1];
    const out = new Date(Math.max(at.getTime(), new Date(last.in).getTime())).toISOString();
    visits[visits.length - 1] = { ...last, out };
    return { ...member, attendance: visits };
  });
}

/**
 * Ghi một lượt quét VÀO/RA cho lần làm việc ĐANG MỞ. Khoá dòng lần làm việc nên nhiều cổng quét cùng lúc
 * vẫn đúng. Hướng:
 *  - "auto": đang trong → RA (trừ khi vừa VÀO < 1 phút → TOO_SOON); đã ra → VÀO lại; chưa có → lỗi.
 *  - "in":   chưa có → kiểm đơn vị/hoạt động rồi THÊM + VÀO; đã ra → VÀO lại; đang trong → ALREADY_IN.
 *  - "out":  đang trong → RA; còn lại → lỗi.
 * Người tìm theo `personId` (quét thẻ) hoặc `index` + `name` (nút tay cho người nhập tên không có thẻ).
 */
export async function recordAttendance(tx: Prisma.TransactionClient, input: {
  permitId: string; sessionId: string; direction: "auto" | "in" | "out"; personId?: string; index?: number; name?: string; now?: Date;
}) {
  const now = input.now ?? new Date();
  await tx.$queryRaw`SELECT "id" FROM "WorkPermitSession" WHERE "id" = ${input.sessionId} FOR UPDATE`;
  const session = await tx.workPermitSession.findFirst({ where: { id: input.sessionId, permitId: input.permitId }, include: { permit: { select: { teamName: true, status: true } } } });
  if (!session || session.endedAt) throw fail("Lần làm việc đã kết thúc hoặc không tồn tại. Tải lại phiếu.", 409);
  const members = sessionMembers(session.members);
  const index = input.personId
    ? members.findIndex(m => m.personId === input.personId)
    : Number.isInteger(input.index) && members[input.index!]?.name === input.name ? input.index! : -1;
  const at = now.toISOString();
  let outcome: AttendanceOutcome;
  let member: PermitMember;
  if (index < 0) {
    if (input.direction !== "in" || !input.personId) throw fail("Người này chưa có trong lần làm việc. Quét để cho vào trước.", 404);
    if (members.length >= 200) throw fail("Lần làm việc đã đủ 200 người");
    const person = await tx.workPermitPerson.findUnique({ where: { id: input.personId } });
    if (!person) throw fail("Không tìm thấy hồ sơ nhân sự", 404);
    if (!person.isActive) throw fail(`${person.name} đang ngừng hoạt động trong danh bạ — không cho vào.`);
    if (person.id === session.commanderId) throw fail(`${person.name} là CHTT của lần làm việc này.`);
    const commander = await tx.workPermitPerson.findUnique({ where: { id: session.commanderId }, select: { company: true } });
    if (!sameCompany(person.company, session.permit.teamName) && !sameCompany(person.company, commander?.company ?? "")) {
      throw fail(`${person.name} thuộc đơn vị “${person.company}”, không phải đơn vị công tác của phiếu (“${session.permit.teamName}”). Không cho vào.`);
    }
    member = { personId: person.id, code: person.code, name: person.name, company: person.company, attendance: [{ in: at, out: null }] };
    members.push(member);
    outcome = "ADDED";
  } else {
    member = members[index];
    const visits: AttendanceVisit[] = Array.isArray(member.attendance) ? member.attendance.slice() : [];
    const inside = attendanceInside(member);
    if (input.direction === "out" || (input.direction === "auto" && inside)) {
      if (!inside) throw fail(`${member.name} không ở trong khu vực làm việc.`);
      const last = lastVisit(member)!;
      if (input.direction === "auto" && now.getTime() - new Date(last.in).getTime() < ATTENDANCE_MIN_STAY_MS) {
        return { outcome: "TOO_SOON" as const, member, at: last.in, ...counts(members) };
      }
      visits[visits.length - 1] = { ...last, out: at };
      outcome = "OUT";
    } else if (inside) {
      return { outcome: "ALREADY_IN" as const, member, at: lastVisit(member)!.in, ...counts(members) };
    } else {
      visits.push({ in: at, out: null });
      outcome = "IN";
    }
    member = { ...member, attendance: visits };
    members[index] = member;
  }
  await tx.workPermitSession.update({ where: { id: session.id }, data: {
    members: permitSnapshot(members), workerCount: 1 + members.length,
    ...(outcome === "ADDED" ? { searchText: normalizeText([session.searchText, `${member.code} ${member.name} ${member.company}`].join(" ")) } : {}),
  } });
  return { outcome, member, at, ...counts(members) };
}

/** Số người trong khu vực (kèm CHTT — luôn có mặt khi lần làm việc đang mở) / tổng người của lần làm việc. */
function counts(members: PermitMember[]) {
  return { inside: 1 + members.filter(attendanceInside).length, total: 1 + members.length };
}
