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
      /*
       * Chỉ giữ hồ sơ khi người này CÒN GẮN với công việc thật:
       *  - phiếu chưa hủy đang ghi họ là CHTT hoặc nhân viên công tác; hoặc
       *  - đã có lần làm việc (lịch sử thực hiện, có khoá ngoại tới hồ sơ).
       * Phiếu ĐÃ HỦY (hoặc đã bị quản trị xoá) không còn giữ ai: phiếu lưu sẵn bản chụp tên + số thẻ
       * nên vẫn đọc được, chỉ gỡ liên kết `commanderPersonId` trỏ về hồ sơ sắp xoá. Đổi CHTT trên
       * phiếu cũng tự nhả người cũ vì `commanderPersonId` đã trỏ sang người mới.
       */
      const [activePermits, sessionCount] = await Promise.all([
        tx.workPermit.findMany({
          where: { status: { not: "CANCELLED" }, OR: [
            { commanderPersonId: before.id },
            { members: { array_contains: [{ personId: before.id }] } },
          ] },
          select: { number: true, year: true }, take: 5,
        }),
        tx.workPermitSession.count({ where: { OR: [
          { commanderId: before.id },
          { members: { array_contains: [{ personId: before.id }] } },
        ] } }),
      ]);
      if (activePermits.length) throw fail(`Nhân sự này còn trong PCT ${activePermits.map(p => `${p.number}/${p.year}`).join(", ")} — đổi CHTT/nhân viên trên phiếu hoặc hủy phiếu trước khi xóa. Nếu chỉ không còn sử dụng, hãy bỏ chọn “Đang hoạt động”.`, 409);
      if (sessionCount) throw fail("Nhân sự này đã có lần làm việc được ghi nhận nên phải giữ hồ sơ để bảo toàn lịch sử. Hãy bỏ chọn “Đang hoạt động” nếu không còn sử dụng.", 409);
      await tx.workPermit.updateMany({ where: { commanderPersonId: before.id, status: "CANCELLED" }, data: { commanderPersonId: null } });
      await tx.workPermitPerson.delete({ where: { id: before.id } });
      return before;
    });
    await audit(user.id, "DELETE_WORK_PERMIT_PERSON", "WorkPermitPerson", removed.id, `Xóa ${removed.code}: ${removed.name} · ${removed.company}`);
    return ok({ id: removed.id });
  });
}
