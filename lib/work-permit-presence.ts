import { attendanceInside } from "@/lib/work-permit-attendance";
import { normalizeText } from "@/lib/nav";
import type { PermitMember } from "@/lib/work-permits";

/** Phiếu cũ chưa theo dõi vào/ra: giữ chỗ đến khi ghi RA hoặc kết thúc lần làm việc. */
export function memberOccupiesWork(member: PermitMember) {
  return member.attendance == null || attendanceInside(member);
}

export function samePermitWorker(a: PermitMember, b: PermitMember) {
  if (a.personId && b.personId) return a.personId === b.personId;
  if (a.code && b.code) return a.code.trim().toUpperCase() === b.code.trim().toUpperCase();
  return Boolean(a.name && b.name) && normalizeText(a.name) === normalizeText(b.name)
    && normalizeText(a.company) === normalizeText(b.company);
}

export function presentMembers(value: unknown): PermitMember[] {
  return Array.isArray(value) ? value.filter((member): member is PermitMember =>
    Boolean(member) && typeof member === "object" && typeof member.name === "string" && memberOccupiesWork(member)) : [];
}
