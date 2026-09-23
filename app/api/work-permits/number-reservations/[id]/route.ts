import { audit, fail, ok, requireRole, requireUser } from "@/lib/api";
import { workPermitPrisma as prisma } from "@/lib/server/work-permit-prisma";
import { requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { permitBody, permitHandle } from "@/lib/server/work-permits";

export const dynamic = "force-dynamic";

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    // Người cấp phiếu KHÔNG còn tự hủy số: cấp sai thì sửa phiếu hoặc đổi loại phiếu với chính số đó.
    // Chỉ quản trị được hủy — cho trường hợp lấy nhầm SỔ (Cơ ↔ Điện), vì số không chuyển sổ được.
    requireRole(user, ["ADMIN"]);
    const body = await permitBody(req);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason || reason.length > 2000) return fail("Cần nhập lý do hủy lượt lấy số (tối đa 2.000 ký tự)", 400);
    const row = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "WorkPermitNumberReservation" WHERE "id" = ${id} FOR UPDATE`;
      const before = await tx.workPermitNumberReservation.findUnique({ where: { id } });
      if (!before) throw fail("Không tìm thấy lượt lấy số", 404);
      if (before.status !== "RESERVED") throw fail("Chỉ được hủy số đã lấy nhưng chưa lưu cấp phiếu", 409);
      const saved = await tx.workPermitNumberReservation.update({ where: { id }, data: {
        status: "CANCELLED", cancelReason: reason, cancelledById: user.id, cancelledAt: new Date(),
      } });
      await tx.workPermitNumberReservationHistory.create({ data: { reservationId: id, action: "CANCELLED",
        actorId: user.id, actorName: user.name ?? "", note: reason } });
      return saved;
    });
    await audit(user.id, "CANCEL_WORK_PERMIT_NUMBER_RESERVATION", "WorkPermitNumberReservation", id,
      `Hủy lượt lấy số ${row.number}/${row.year}: ${reason}`);
    return ok(row);
  });
}
