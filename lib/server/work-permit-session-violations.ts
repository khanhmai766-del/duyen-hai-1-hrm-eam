import { fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { withPhotoUrl } from "@/lib/server/work-permit-people";

/** Đọc vi phạm và URL ảnh hiện tại theo liên kết hồ sơ, không suy đoán từ tên hoặc số thẻ trên PCT. */
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
  // Chung một truy vấn cho cảnh báo và ảnh; chỉ trả URL có phiên bản, không tải byte ảnh ở đây.
  const people = await db.workPermitPerson.findMany({ where: { id: { in: ids } }, select: { id: true, violations: true, photoKey: true, photoSource: true } });
  return people.map(withPhotoUrl);
}
