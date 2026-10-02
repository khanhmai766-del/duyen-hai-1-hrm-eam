import { requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { isCardlessCode } from "@/lib/work-permit-card";
import { attendanceInside } from "@/lib/work-permit-attendance";
import type { PermitMember } from "@/lib/work-permits";
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
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw fail(isCardlessCode(data.code) ? "Hồ sơ chưa có thẻ với họ tên này đã tồn tại. Hãy tìm và chọn hồ sơ đó." : "Số thẻ ra vào cổng đã được dùng cho nhân sự khác.", 409);
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
       * Người thường: chỉ xoá hồ sơ CHƯA gắn với công việc thật —
       *  - không phiếu chưa hủy nào ghi họ là CHTT hoặc nhân viên công tác; và
       *  - chưa có lần làm việc nào (lịch sử thực hiện).
       * Quản trị: xoá được cả người đã làm việc, miễn là mọi phiếu có họ đã KẾT THÚC (hoặc hủy), mọi lần làm việc
       * đã đóng và họ đã quét RA. Phiếu/lần làm việc giữ bản chụp tên + số thẻ nên lịch sử vẫn đọc được; chỉ gỡ
       * liên kết tới hồ sơ (commanderPersonId, WorkPermitSession.commanderId → null).
       */
      const admin = user.role === "ADMIN";
      const involves = { OR: [{ commanderPersonId: before.id }, { members: { array_contains: [{ personId: before.id }] } }] };
      const [openPermits, sessions] = await Promise.all([
        tx.workPermit.findMany({
          where: { status: { notIn: admin ? ["CANCELLED", "CLOSED"] : ["CANCELLED"] }, ...involves },
          select: { number: true, year: true }, take: 5,
        }),
        tx.workPermitSession.findMany({
          where: { OR: [{ commanderId: before.id }, { members: { array_contains: [{ personId: before.id }] } }] },
          select: { endedAt: true, members: true, permit: { select: { number: true, year: true } } },
        }),
      ]);
      const numbers = (rows: Array<{ number: string; year: number }>) => [...new Set(rows.map(p => `${p.number}/${p.year}`))].join(", ");
      if (openPermits.length) throw fail(admin
        ? `Nhân sự này còn trong PCT ${numbers(openPermits)} chưa kết thúc — kết thúc hoặc hủy phiếu trước khi xóa.`
        : `Nhân sự này còn trong PCT ${numbers(openPermits)} — đổi CHTT/nhân viên trên phiếu hoặc hủy phiếu trước khi xóa. Nếu chỉ không còn sử dụng, hãy bỏ chọn “Đang hoạt động”.`, 409);
      if (sessions.length && !admin) throw fail("Nhân sự này đã có lần làm việc được ghi nhận nên phải giữ hồ sơ để bảo toàn lịch sử. Hãy bỏ chọn “Đang hoạt động” nếu không còn sử dụng (Quản trị có thể xóa sau khi các phiếu đã kết thúc).", 409);
      const running = sessions.filter(session => !session.endedAt);
      if (running.length) throw fail(`Nhân sự này còn trong lần làm việc chưa kết thúc của PCT ${numbers(running.map(s => s.permit))}.`, 409);
      const stillInside = sessions.filter(session => (Array.isArray(session.members) ? session.members as unknown as PermitMember[] : [])
        .some(member => member?.personId === before.id && attendanceInside(member)));
      if (stillInside.length) throw fail(`Nhân sự này chưa được ghi RA khỏi khu vực ở PCT ${numbers(stillInside.map(s => s.permit))} — ghi ra trước khi xóa.`, 409);
      await tx.workPermit.updateMany({ where: { commanderPersonId: before.id }, data: { commanderPersonId: null } });
      await tx.workPermitSession.updateMany({ where: { commanderId: before.id }, data: { commanderId: null } });
      await tx.workPermitPerson.delete({ where: { id: before.id } });
      return { ...before, workedSessions: sessions.length };
    });
    await audit(user.id, "DELETE_WORK_PERMIT_PERSON", "WorkPermitPerson", removed.id, `Xóa ${removed.code}: ${removed.name} · ${removed.company}${removed.workedSessions ? ` (Quản trị — đã có ${removed.workedSessions} lần làm việc, lịch sử giữ theo bản chụp trên phiếu)` : ""}`);
    return ok({ id: removed.id });
  });
}
