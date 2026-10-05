import { audit, fail, ok, requireUser } from "@/lib/api";
import { workPermitPrisma as prisma } from "@/lib/server/work-permit-prisma";
import { requirePermitIssuer } from "@/lib/server/work-permit-permissions";
import { lockPermitNumberScope, releaseUnusedReservation } from "@/lib/server/work-permit-number-reservations";
import { permitBody, permitHandle } from "@/lib/server/work-permits";

export const dynamic = "force-dynamic";

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return permitHandle(async () => {
    const user = await requireUser(); requirePermitIssuer(user);
    const body = await permitBody(req);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason || reason.length > 2000) return fail("Cần nhập lý do hủy lượt lấy số (tối đa 2.000 ký tự)", 400);
    const scope = await prisma.workPermitNumberReservation.findUnique({ where: { id }, select: { kind: true, year: true } });
    if (!scope) return fail("Không tìm thấy lượt lấy số", 404);
    const result = await prisma.$transaction(async tx => {
      // Cùng khóa với thao tác lấy số để không có máy khác lấy số mới trong lúc đang xét trả lại số cuối dãy.
      await lockPermitNumberScope(tx, scope.kind as "MECHANICAL" | "ELECTRICAL", scope.year);
      await tx.$queryRaw`SELECT "id" FROM "WorkPermitNumberReservation" WHERE "id" = ${id} FOR UPDATE`;
      const before = await tx.workPermitNumberReservation.findUnique({ where: { id } });
      if (!before) throw fail("Không tìm thấy lượt lấy số", 404);
      if (before.status !== "RESERVED" && !(before.status === "REVIEW" && before.nkvhPctId && !before.permitId)) throw fail("Chỉ được hủy số đã lấy nhưng chưa lưu cấp phiếu", 409);
      if (before.ownerId !== user.id && user.role !== "ADMIN") throw fail("Bạn chỉ được hủy lượt lấy số của chính mình", 403);
      if (body.confirmUnused !== true) throw fail("Cần xác nhận số này chưa dùng trên PCT giấy hoặc NKVH.", 400);
      await releaseUnusedReservation(tx, before, user.id, user.name ?? "", reason);
      const saved = await tx.workPermitNumberReservation.findUniqueOrThrow({ where: { id } });
      const released = true;
      return { row: saved, released };
    });
    await audit(user.id, "CANCEL_WORK_PERMIT_NUMBER_RESERVATION", "WorkPermitNumberReservation", id,
      `Hủy lượt lấy số ${result.row.number}/${result.row.year}${result.released ? ", tự động cho phép cấp lại" : ""}: ${reason}`);
    return ok(result.row);
  });
}
