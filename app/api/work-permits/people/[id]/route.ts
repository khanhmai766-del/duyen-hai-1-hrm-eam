import { requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireUser } from "@/lib/api";
import { permitBody, permitHandle } from "@/lib/server/work-permits";
import { parsePermitPerson } from "@/lib/server/work-permit-people";
export const dynamic = "force-dynamic";
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const body = await permitBody(req); const data = parsePermitPerson(body);
    let row;
    try {
      row = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "WorkPermitPerson" WHERE "id" = ${params.id} FOR UPDATE`;
        const before = await tx.workPermitPerson.findUnique({ where: { id: params.id } });
        if (!before) throw fail("Không tìm thấy nhân sự nhà thầu", 404);
        if (body.version !== before.version) throw fail("Hồ sơ đã thay đổi. Vui lòng tải lại danh bạ.", 409);
        // Các PCT/lần làm việc lưu snapshot tên, số thẻ và nhà thầu nên sửa danh bạ
        // không làm đổi hồ sơ lịch sử, kể cả khi người này đang tham gia công tác.
        return tx.workPermitPerson.update({ where: { id: before.id }, data: { ...data, version: { increment: 1 } } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw fail("Số thẻ an toàn đã được dùng cho nhân sự khác.", 409);
      throw error;
    }
    await audit(user.id, "UPDATE_WORK_PERMIT_PERSON", "WorkPermitPerson", row.id, `Cập nhật ${row.code}: ${row.name} · ${row.company}; ${row.isActive ? "đang hoạt động" : "ngừng hoạt động"}`);
    return ok(row);
  });
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const body = await permitBody(req);
    const removed = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "WorkPermitPerson" WHERE "id" = ${params.id} FOR UPDATE`;
      const before = await tx.workPermitPerson.findUnique({ where: { id: params.id } });
      if (!before) throw fail("Không tìm thấy nhân sự nhà thầu", 404);
      if (body.version !== before.version) throw fail("Hồ sơ đã thay đổi. Vui lòng tải lại danh bạ.", 409);
      const [permitCount, sessionCount] = await Promise.all([
        tx.workPermit.count({ where: { commanderPersonId: before.id } }),
        tx.workPermitSession.count({ where: { OR: [
          { commanderId: before.id },
          { members: { array_contains: [{ personId: before.id }] } },
        ] } }),
      ]);
      if (permitCount || sessionCount) throw fail("Nhân sự này đã được ghi nhận trên PCT nên không thể xóa để bảo toàn lịch sử. Hãy bỏ chọn “Đang hoạt động” nếu không còn sử dụng.", 409);
      await tx.workPermitPerson.delete({ where: { id: before.id } });
      return before;
    });
    await audit(user.id, "DELETE_WORK_PERMIT_PERSON", "WorkPermitPerson", removed.id, `Xóa ${removed.code}: ${removed.name} · ${removed.company}`);
    return ok({ id: removed.id });
  });
}
