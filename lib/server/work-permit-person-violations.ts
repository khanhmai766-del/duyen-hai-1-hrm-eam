import { randomUUID } from "node:crypto";
import { fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/** Khóa hồ sơ để hai người ghi đồng thời không ghi đè lịch sử của nhau. */
export async function recordPermitPersonViolation(id: string, body: Record<string, unknown>, user: { id: string; name?: string | null }, db = prisma, context?: { permitId: string; sessionId: string; permitNumber: string }) {
  if (typeof body.description !== "string" || !body.description.trim() || body.description.length > 2000)
    throw fail("Vui lòng nhập lỗi vi phạm, tối đa 2.000 ký tự");
  const violation = { id: randomUUID(), description: body.description.trim(), recordedAt: new Date().toISOString(), recordedById: user.id, recordedByName: user.name ?? "", ...(context ?? {}) };
  const row = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "WorkPermitPerson" WHERE "id" = ${id} FOR UPDATE`;
    const person = await tx.workPermitPerson.findUnique({ where: { id } });
    if (!person) throw fail("Không tìm thấy nhân sự nhà thầu", 404);
    if (body.version !== person.version) throw fail("Hồ sơ đã thay đổi. Vui lòng tải lại danh bạ.", 409);
    const previous = Array.isArray(person.violations) ? person.violations : [];
    return tx.workPermitPerson.update({ where: { id }, data: { violations: [...previous, violation], version: { increment: 1 } } });
  });
  return { row, violation };
}

/** Chỉ nhận liên kết hồ sơ thật; tên/số thẻ trong snapshot không đủ để ghi lỗi cho người khác. */
export function requireViolationSessionMember(members: unknown, personId: string) {
  if (!Array.isArray(members) || !members.some(member => member && typeof member === "object" && member.personId === personId))
    throw fail("Nhân viên không thuộc lần làm việc này", 403);
}
