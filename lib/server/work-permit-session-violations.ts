import { fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/** Đọc lịch sử hiện tại theo liên kết hồ sơ, không dùng bản chụp tên hoặc số thẻ trên PCT. */
export async function loadPermitSessionViolations(permitId: string, sessionId: string, db = prisma) {
  const session = await db.workPermitSession.findFirst({
    where: { id: sessionId, permitId }, select: { members: true },
  });
  if (!session) throw fail("Không tìm thấy lần làm việc của PCT này", 404);
  const ids = [...new Set((Array.isArray(session.members) ? session.members : []).flatMap(member => {
    if (!member || typeof member !== "object" || Array.isArray(member)) return [];
    return typeof member.personId === "string" && member.personId ? [member.personId] : [];
  }))];
  if (!ids.length) return [];
  return db.workPermitPerson.findMany({ where: { id: { in: ids } }, select: { id: true, violations: true } });
}
