import { requirePermitVisible } from "@/lib/server/work-permit-scope";
import { requirePermitIssuer } from "@/lib/server/work-permit-permissions";
import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireUser } from "@/lib/api";
import { permitBody, permitHandle, permitSnapshot, permitText } from "@/lib/server/work-permits";
import { CONTRACTOR_PERMIT_TRANSITIONS, formatPermitNumber, PERMIT_TRANSITIONS, type PermitStatus } from "@/lib/work-permits";

export const dynamic = "force-dynamic";

/**
 * Hủy PCT — thao tác vòng đời riêng, không đòi dữ liệu biểu mẫu (phiếu nháp hay phiếu cấp từ tiện ích NKVH
 * có thể còn thiếu thông tin). Phiếu hủy KHÔNG bị xoá: vẫn nằm trong sổ ở trạng thái "Đã hủy" kèm lý do,
 * file Word trên S3 giữ nguyên làm hồ sơ; số mặc định bị bỏ, chỉ quản trị mới có thể cho phép cấp lại.
 * Nháp: lý do tuỳ chọn. Phiếu đã cấp: bắt buộc lý do, theo bảng chuyển trạng thái của loại đơn vị;
 * nhà thầu đang có lần làm việc mở thì phải kết thúc trước.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return permitHandle(async () => {
    const user = await requireUser(); requirePermitIssuer(user);
    await requirePermitVisible(user, params.id);
    const body = await permitBody(req);
    const reasonInput = permitText(body, "reason", 2000);
    const { row, draft } = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${params.id} FOR UPDATE`;
      const before = await tx.workPermit.findUnique({ where: { id: params.id } });
      if (!before) throw fail("Không tìm thấy PCT", 404);
      if (body.version !== before.version) throw fail("Phiếu đã được người khác cập nhật. Đóng cửa sổ và tải lại trước khi hủy.", 409);
      const draft = before.status === "DRAFT";
      // Hủy phiếu ĐÃ CẤP: chỉ Quản trị (nghiệp vụ 04/10/2026). Hủy nháp vẫn theo nhóm cấp phiếu.
      if (!draft && user.role !== "ADMIN") throw fail("Chỉ Quản trị được hủy phiếu công tác đã cấp", 403);
      const transitions = before.teamType === "CONTRACTOR" ? CONTRACTOR_PERMIT_TRANSITIONS : PERMIT_TRANSITIONS;
      if (!transitions[before.status as PermitStatus]?.includes("CANCELLED")) {
        throw fail(before.status === "CANCELLED" ? "PCT đã được hủy trước đó." : "PCT ở trạng thái này không hủy được.", 409);
      }
      if (!draft && reasonInput.length < 5) throw fail("Nhập lý do hủy PCT (ít nhất 5 ký tự).");
      if (before.teamType === "CONTRACTOR" && await tx.workPermitSession.count({ where: { permitId: before.id, endedAt: null } })) {
        throw fail("Nhà thầu đang có lần làm việc mở — kết thúc lần làm việc trước khi hủy PCT.", 409);
      }
      const reason = reasonInput || before.statusReason.trim() || "Hủy phiếu nháp";
      const saved = await tx.workPermit.updateMany({
        where: { id: before.id, version: before.version, status: before.status },
        data: { status: "CANCELLED", statusReason: reason, version: { increment: 1 } },
      });
      if (saved.count !== 1) throw fail("Phiếu vừa được cập nhật ở phiên khác. Vui lòng tải lại.", 409);
      const after = await tx.workPermit.findUniqueOrThrow({ where: { id: before.id } });
      // Số của phiếu đã cấp mặc định bị bỏ; chỉ thao tác Mốc sổ giấy mới giải phóng được.
      const reservation = await tx.workPermitNumberReservation.findUnique({ where: { permitId: after.id } });
      if (reservation?.status === "ISSUED") {
        await tx.workPermitNumberReservation.update({ where: { id: reservation.id },
          data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: user.id, cancelReason: reason } });
        await tx.workPermitNumberReservationHistory.create({ data: { reservationId: reservation.id, action: "CANCELLED",
          actorId: user.id, actorName: user.name ?? "", permitId: after.id, note: reason } });
      }
      await tx.workPermitHistory.create({ data: { permitId: after.id, actorId: user.id, actorName: user.name ?? "",
        action: draft ? "Hủy phiếu nháp" : `Hủy PCT: ${reason}`, before: permitSnapshot(before), after: permitSnapshot(after) } });
      return { row: after, draft };
    });
    await audit(user.id, draft ? "CANCEL_DRAFT_WORK_PERMIT" : "CANCEL_WORK_PERMIT", "WorkPermit", row.id, `Hủy PCT ${row.number ? formatPermitNumber(row) : row.id}: ${row.statusReason}`);
    return ok(row);
  });
}
