import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { fail, requireRole } from "@/lib/api";
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

/** Chỉ Admin được sửa/xóa; version chung và khóa hàng bảo vệ cả thao tác ghi thêm đồng thời. */
export async function changePermitPersonViolation(id: string, body: Record<string, unknown>, user: { role: string }, action: "edit" | "delete", db = prisma) {
  requireRole(user, ["ADMIN"]);
  if (typeof body.violationId !== "string" || !body.violationId || body.violationId.length > 100)
    throw fail("Lần vi phạm không hợp lệ");
  if (action === "edit" && (typeof body.description !== "string" || !body.description.trim() || body.description.length > 2000))
    throw fail("Vui lòng nhập lỗi vi phạm, tối đa 2.000 ký tự");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "WorkPermitPerson" WHERE "id" = ${id} FOR UPDATE`;
    const person = await tx.workPermitPerson.findUnique({ where: { id } });
    if (!person) throw fail("Không tìm thấy nhân sự nhà thầu", 404);
    if (body.version !== person.version) throw fail("Hồ sơ đã thay đổi. Vui lòng tải lại trước khi sửa hoặc xóa vi phạm.", 409);
    const previous = Array.isArray(person.violations) ? person.violations : [];
    const index = previous.findIndex(item => item !== null && typeof item === "object" && !Array.isArray(item) && item.id === body.violationId);
    if (index < 0) throw fail("Không tìm thấy lần vi phạm. Vui lòng tải lại hồ sơ.", 404);
    const violation = previous[index] as Prisma.JsonObject;
    const description = action === "edit" ? (body.description as string).trim() : undefined;
    const violations = action === "delete" ? previous.filter((_, i) => i !== index) : previous.map((item, i) => i === index ? { ...violation, description: description! } : item);
    const row = await tx.workPermitPerson.update({ where: { id }, data: { violations, version: { increment: 1 } } });
    return { row, violation, description };
  });
}

/** Chỉ nhận liên kết hồ sơ thật; tên/số thẻ trong snapshot không đủ để ghi lỗi cho người khác. */
export function requireViolationSessionMember(members: unknown, personId: string) {
  if (!Array.isArray(members) || !members.some(member => member && typeof member === "object" && member.personId === personId))
    throw fail("Nhân viên không thuộc lần làm việc này", 403);
}
