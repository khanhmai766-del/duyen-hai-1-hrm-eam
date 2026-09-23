import { permitIssueUpdateNeedsExecution } from "@/lib/work-permit-permissions";
import { requirePermitIssue, requirePermitExecute, permitCapabilities } from "@/lib/server/work-permit-permissions";
import { resolvePermitSafety } from "@/lib/server/work-permit-safety";
import { workPermitPrisma as prisma } from "@/lib/server/work-permit-prisma";
import { audit, fail, ok, requireRole, requireUser } from "@/lib/api";
import { defaultPermitFormat, formatPermitNumber, PERMIT_STATUSES, PERMIT_TRANSITIONS, CONTRACTOR_PERMIT_TRANSITIONS, type PermitStatus } from "@/lib/work-permits";
import { parsePermit, permitBody, permitHandle, permitSnapshot, resolvePermitDefectLink } from "@/lib/server/work-permits";
import { resolvePermitIdentities } from "@/lib/server/work-permit-identities";
import { historySummarySelect } from "@/lib/server/work-permit-selects";
import { consumePermitNumberReservation, teamTypeLabel } from "@/lib/server/work-permit-number-reservations";
import type { PermitKind } from "@/lib/work-permits";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return permitHandle(async () => {
    const user = await requireUser();
    const row = await prisma.workPermit.findUnique({ where: { id: params.id }, include: { sessions: { take: 2, orderBy: [{ openedAt: "desc" }, { id: "desc" }] }, history: { take: 2, select: historySummarySelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }, _count: { select: { sessions: true, history: true } } } });
    return row ? ok(row, await permitCapabilities(user)) : fail("Không tìm thấy PCT", 404);
  });
}
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const body = await permitBody(req);
    const status = String(body.status) as PermitStatus;
    if (!Object.hasOwn(PERMIT_STATUSES, status)) return fail("Trạng thái không hợp lệ");
    const row = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${params.id} FOR UPDATE`;
      const before = await tx.workPermit.findUnique({ where: { id: params.id } });
      if (!before) throw fail("Không tìm thấy PCT", 404);
      if (permitIssueUpdateNeedsExecution(before, body)) await requirePermitExecute(user);
      if (before.status === "PAUSED" && body.status !== "CANCELLED" && body.statusReason !== undefined && body.statusReason !== before.statusReason) await requirePermitExecute(user);
      if (["CLOSED", "CANCELLED"].includes(before.status)) throw fail("Phiếu đã đóng hoặc hủy được khóa để giữ lịch sử", 409);
      if (body.version !== before.version) throw fail("Phiếu đã được người khác cập nhật. Đóng cửa sổ và tải lại trước khi sửa.", 409);
      const linkedBody = await resolvePermitDefectLink(tx, {
        ...body,
        defectId: body.defectId === undefined ? before.defectId : body.defectId,
        repairRequestNumber: body.repairRequestNumber === undefined ? before.repairRequestNumber : body.repairRequestNumber,
      }, before);
      const data = parsePermit(await resolvePermitIdentities(tx, { ...linkedBody, format: body.format ?? before.format,
        position: body.position === undefined ? before.position : body.position,
        nkvhPctId: body.nkvhPctId === undefined ? before.nkvhPctId : body.nkvhPctId,
        registrationNumber: body.registrationNumber === undefined ? before.registrationNumber : body.registrationNumber,
        managingUnit: body.managingUnit === undefined ? before.managingUnit : body.managingUnit,
        plantName: body.plantName === undefined ? before.plantName : body.plantName,
        sourceClassification: body.sourceClassification === undefined ? before.sourceClassification : body.sourceClassification,
        electricalSafetySupervisorName: body.electricalSafetySupervisorName === undefined ? before.electricalSafetySupervisorName : body.electricalSafetySupervisorName,
        workScope: body.workScope === undefined ? before.workScope : body.workScope,
        disciplines: body.disciplines === undefined ? before.disciplines : body.disciplines,
        plannedStartAt: body.plannedStartAt === undefined ? before.plannedStartAt?.toISOString() ?? null : body.plannedStartAt,
        plannedEndAt: body.plannedEndAt === undefined ? before.plannedEndAt?.toISOString() ?? null : body.plannedEndAt,
      }, user, before), status);
      /*
       * Đổi LOẠI ĐƠN VỊ (nội bộ · điện tử ⇄ nhà thầu · giấy) giữ nguyên số: số thuộc về sổ, không
       * thuộc loại đơn vị. Chỉ cho khi chưa có gì không đảo ngược được — phiếu mới ở "Đã cấp" (hoặc
       * nháp), chưa cho phép làm việc và chưa từng mở lần làm việc. Quá mốc đó thì hồ sơ đã có chữ
       * ký theo loại cũ; muốn sửa phải để quản trị xoá phiếu rồi cấp lại.
       * Hình thức luôn đi theo loại đơn vị; đổi sổ (Cơ ↔ Điện) thì không bao giờ được.
       */
      const teamTypeChanged = data.teamType !== before.teamType;
      if (data.kind !== before.kind) throw fail("Không thể đổi loại PCT (sổ Cơ/Điện) của phiếu đã tạo", 409);
      if (teamTypeChanged) {
        if (!["DRAFT", "ISSUED"].includes(before.status) || status !== before.status) throw fail("Chỉ đổi loại phiếu khi phiếu đang ở trạng thái Đã cấp và không đổi trạng thái cùng lúc", 409);
        if (before.authorizedAt) throw fail("Phiếu đã được cho phép làm việc — không đổi loại phiếu được nữa", 409);
        if (await tx.workPermitSession.count({ where: { permitId: before.id } })) throw fail("Phiếu đã có lần làm việc — không đổi loại phiếu được nữa", 409);
        if (data.format !== defaultPermitFormat(data.teamType)) throw fail("PCT nhà thầu dùng phiếu giấy; PCT nội bộ dùng phiếu điện tử");
      } else if (data.format !== (before.format ?? defaultPermitFormat(before.teamType))) {
        throw fail("Không thể đổi hình thức của phiếu đã tạo", 409);
      }
      if (permitIssueUpdateNeedsExecution(before, data)) await requirePermitExecute(user);
      if (before.teamType === "INTERNAL" && (data.authorizerName !== before.authorizerName || (data.authorizedAt?.getTime() ?? null) !== (before.authorizedAt?.getTime() ?? null) || (body.progress !== undefined && body.progress !== before.progress))) throw fail("PCT nội bộ không quản lý bước cho phép hoặc tiến độ; dữ liệu cũ được giữ nguyên");
      if (body.progress !== undefined && body.progress !== before.progress && (typeof body.progress !== "number" || !Number.isInteger(body.progress) || body.progress < 0 || body.progress > 100 || !["ACTIVE", "PAUSED", "WAITING"].includes(before.status))) throw fail("Chỉ cập nhật tiến độ từ 0 đến 100% cho phiếu đã vào làm việc");
      if (status !== before.status && !(before.teamType === "CONTRACTOR" ? CONTRACTOR_PERMIT_TRANSITIONS : PERMIT_TRANSITIONS)[before.status as PermitStatus]?.includes(status)) throw fail("Không thể chuyển sang trạng thái này", 409);
      if (before.status !== "DRAFT" && (data.kind !== before.kind || data.year !== before.year || data.number !== before.number)) throw fail("Không được đổi loại, số hoặc năm của phiếu đã cấp", 409);
      if (before.issuedAt && !data.issuedAt || before.authorizedAt && !data.authorizedAt) throw fail("Không được xóa mốc cấp hoặc cho phép làm việc đã ghi nhận", 409);
      if (before.teamType === "CONTRACTOR" && !teamTypeChanged) {
        if ((before.authorizedAt?.getTime() ?? null) !== (data.authorizedAt?.getTime() ?? null)) throw fail("Thời điểm cho phép làm việc được ghi qua từng lần làm việc", 409);
        const live = await tx.workPermitSession.findFirst({ where: { permitId: before.id, endedAt: null } });
        if (live) throw fail("Cần kết thúc lần làm việc đang mở trước khi sửa hoặc đóng/hủy PCT", 409);
        const last = await tx.workPermitSession.findFirst({ where: { permitId: before.id }, orderBy: { openedAt: "desc" } });
        if (status === "CLOSED" && (!last?.endedAt || !data.closedAt || data.closedAt < last.endedAt)) throw fail("Thời điểm đóng PCT phải từ thời điểm kết thúc lần làm việc cuối trở đi");
        if (last && data.issuedAt && before.authorizedAt && data.issuedAt > before.authorizedAt) throw fail("Thời điểm cấp không được sau lần cho phép làm việc đầu tiên");
      }
      const saved = await tx.workPermit.updateMany({ where: { id: params.id, version: before.version }, data: { ...data, ...(body.progress !== undefined ? { progress: body.progress as number | null } : {}), safetyItems: permitSnapshot(await resolvePermitSafety(tx, { ...body, format: data.format, teamType: data.teamType }, before)), status, version: { increment: 1 } } });
      if (saved.count !== 1) throw fail("Phiếu vừa được cập nhật ở phiên khác. Vui lòng tải lại.", 409);
      const after = await tx.workPermit.findUniqueOrThrow({ where: { id: params.id } });
      if (before.status === "DRAFT" && status === "ISSUED") {
        await consumePermitNumberReservation(tx, { reservationId: body.reservationId, kind: data.kind as PermitKind,
          year: data.year, number: data.number, teamType: data.teamType, userId: user.id, userName: user.name ?? "",
          isAdmin: user.role === "ADMIN", permitId: after.id });
      }
      if (teamTypeChanged && before.status !== "DRAFT") {
        // Lượt giữ số đã gắn phiếu cũng mang loại đơn vị — cập nhật cho khớp để tra cứu số không lệch.
        const reservation = await tx.workPermitNumberReservation.findUnique({ where: { permitId: after.id } });
        if (reservation) {
          await tx.workPermitNumberReservation.update({ where: { id: reservation.id }, data: { teamType: data.teamType } });
          await tx.workPermitNumberReservationHistory.create({ data: { reservationId: reservation.id, action: "TEAM_TYPE_CHANGED",
            actorId: user.id, actorName: user.name ?? "", permitId: after.id, note: `${teamTypeLabel(before.teamType)} → ${teamTypeLabel(data.teamType)}` } });
        }
      }
      if (status === "CANCELLED" && before.status !== "CANCELLED") {
        const reservation = await tx.workPermitNumberReservation.findUnique({ where: { permitId: after.id } });
        if (reservation?.status === "ISSUED") {
          await tx.workPermitNumberReservation.update({ where: { id: reservation.id },
            data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: user.id, cancelReason: data.statusReason } });
          await tx.workPermitNumberReservationHistory.create({ data: { reservationId: reservation.id, action: "CANCELLED",
            actorId: user.id, actorName: user.name ?? "", permitId: after.id, note: data.statusReason } });
        }
      }
      await tx.workPermitHistory.create({ data: { permitId: after.id, actorId: user.id, actorName: user.name ?? "", action: teamTypeChanged ? `Đổi loại phiếu: ${teamTypeLabel(before.teamType)} → ${teamTypeLabel(data.teamType)}` : status === before.status ? "Cập nhật thông tin" : `Chuyển sang ${PERMIT_STATUSES[status]}`, before: permitSnapshot(before), after: permitSnapshot(after) } });
      return after;
    });
    await audit(user.id, "UPDATE_WORK_PERMIT", "WorkPermit", row.id, `Cập nhật PCT ${formatPermitNumber(row)}: ${PERMIT_STATUSES[status]}`);
    return ok(row);
  });
}

/**
 * XOÁ HẲN một PCT — lối can thiệp của QUẢN TRỊ khi phiếu ghi sai không sửa được (nhập nhầm sổ,
 * trùng phiếu…). Người cấp phiếu thường KHÔNG có quyền này: phiếu sai thì hủy (vẫn giữ trong sổ).
 *
 * Xoá cả các lần làm việc và lịch sử của phiếu (FK Restrict nên phải xoá trước). Không mất dấu:
 * AuditLog giữ bản chụp đầy đủ phiếu + lần làm việc + lý do. Lượt giữ số gắn với phiếu chuyển sang
 * CANCELLED kèm lý do, nên số này được cấp lại theo đúng luồng "cấp lại số đã hủy".
 */
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return permitHandle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    const body = await permitBody(req);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 5 || reason.length > 2000) return fail("Cần nhập lý do xoá phiếu (5 – 2.000 ký tự)");
    const removed = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${params.id} FOR UPDATE`;
      const before = await tx.workPermit.findUnique({ where: { id: params.id }, include: { sessions: true } });
      if (!before) throw fail("Không tìm thấy PCT", 404);
      if (body.version !== before.version) throw fail("Phiếu vừa được cập nhật ở phiên khác. Tải lại rồi thử xoá lại.", 409);
      await tx.workPermitSession.deleteMany({ where: { permitId: before.id } });
      const history = await tx.workPermitHistory.deleteMany({ where: { permitId: before.id } });
      const reservations = await tx.workPermitNumberReservation.findMany({ where: { permitId: before.id, status: { not: "CANCELLED" } }, select: { id: true } });
      for (const reservation of reservations) {
        await tx.workPermitNumberReservation.update({ where: { id: reservation.id }, data: { status: "CANCELLED", cancelReason: `Quản trị xoá PCT: ${reason}`, cancelledById: user.id, cancelledAt: new Date() } });
        await tx.workPermitNumberReservationHistory.create({ data: { reservationId: reservation.id, action: "PERMIT_DELETED", actorId: user.id, actorName: user.name ?? "", permitId: before.id, note: reason } });
      }
      await tx.workPermit.delete({ where: { id: before.id } });
      return { before, historyCount: history.count };
    });
    const { before } = removed;
    await audit(user.id, "DELETE_WORK_PERMIT", "WorkPermit", before.id, JSON.stringify({
      message: `Quản trị xoá PCT ${formatPermitNumber(before)}: ${reason}`,
      reason, historyCount: removed.historyCount, permit: permitSnapshot(before),
    }));
    return ok({ id: before.id });
  });
}
