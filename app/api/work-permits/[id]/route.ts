import { resolvePermitSafety } from "@/lib/server/work-permit-safety";
import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireRole, requireUser } from "@/lib/api";
import { formatPermitNumber, PERMIT_STATUSES, PERMIT_TRANSITIONS, CONTRACTOR_PERMIT_TRANSITIONS, PERMIT_WRITE_ROLES, type PermitStatus } from "@/lib/work-permits";
import { parsePermit, permitBody, permitHandle, permitSnapshot } from "@/lib/server/work-permits";
import { resolvePermitIdentities } from "@/lib/server/work-permit-identities";
import { historySummarySelect } from "@/lib/server/work-permit-selects";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return permitHandle(async () => {
    await requireUser();
    const row = await prisma.workPermit.findUnique({ where: { id: params.id }, include: { sessions: { take: 2, orderBy: [{ openedAt: "desc" }, { id: "desc" }] }, history: { take: 2, select: historySummarySelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }, _count: { select: { sessions: true, history: true } } } });
    return row ? ok(row) : fail("Không tìm thấy PCT", 404);
  });
}
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return permitHandle(async () => {
    const user = await requireUser(); requireRole(user, PERMIT_WRITE_ROLES);
    const body = await permitBody(req);
    const status = String(body.status) as PermitStatus;
    if (!Object.hasOwn(PERMIT_STATUSES, status)) return fail("Trạng thái không hợp lệ");
    const row = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${params.id} FOR UPDATE`;
      const before = await tx.workPermit.findUnique({ where: { id: params.id } });
      if (!before) throw fail("Không tìm thấy PCT", 404);
      if (["CLOSED", "CANCELLED"].includes(before.status)) throw fail("Phiếu đã đóng hoặc hủy được khóa để giữ lịch sử", 409);
      if (body.version !== before.version) throw fail("Phiếu đã được người khác cập nhật. Đóng cửa sổ và tải lại trước khi sửa.", 409);
      const data = parsePermit(await resolvePermitIdentities(tx, { ...body, format: body.format ?? before.format,
        position: body.position === undefined ? before.position : body.position,
        registrationNumber: body.registrationNumber === undefined ? before.registrationNumber : body.registrationNumber,
        electricalSafetySupervisorName: body.electricalSafetySupervisorName === undefined ? before.electricalSafetySupervisorName : body.electricalSafetySupervisorName,
        workScope: body.workScope === undefined ? before.workScope : body.workScope,
        disciplines: body.disciplines === undefined ? before.disciplines : body.disciplines,
        plannedStartAt: body.plannedStartAt === undefined ? before.plannedStartAt?.toISOString() ?? null : body.plannedStartAt,
        plannedEndAt: body.plannedEndAt === undefined ? before.plannedEndAt?.toISOString() ?? null : body.plannedEndAt,
      }, user, before), status);
      if (status !== before.status && !(before.teamType === "CONTRACTOR" ? CONTRACTOR_PERMIT_TRANSITIONS : PERMIT_TRANSITIONS)[before.status as PermitStatus]?.includes(status)) throw fail("Không thể chuyển sang trạng thái này", 409);
      if (before.status !== "DRAFT" && (data.kind !== before.kind || data.year !== before.year || data.number !== before.number)) throw fail("Không được đổi loại, số hoặc năm của phiếu đã cấp", 409);
      if (before.issuedAt && !data.issuedAt || before.authorizedAt && !data.authorizedAt) throw fail("Không được xóa mốc cấp hoặc cho phép làm việc đã ghi nhận", 409);
      if (before.status !== "DRAFT" && data.teamType !== before.teamType) throw fail("Không được đổi loại đơn vị của phiếu đã cấp", 409);
      if (before.teamType === "CONTRACTOR") {
        if ((before.authorizedAt?.getTime() ?? null) !== (data.authorizedAt?.getTime() ?? null)) throw fail("Thời điểm cho phép làm việc được ghi qua từng lần làm việc", 409);
        const live = await tx.workPermitSession.findFirst({ where: { permitId: before.id, endedAt: null } });
        if (live) throw fail("Cần kết thúc lần làm việc đang mở trước khi sửa hoặc đóng/hủy PCT", 409);
        const last = await tx.workPermitSession.findFirst({ where: { permitId: before.id }, orderBy: { openedAt: "desc" } });
        if (status === "CLOSED" && (!last?.endedAt || !data.closedAt || data.closedAt < last.endedAt)) throw fail("Thời điểm đóng PCT phải từ thời điểm kết thúc lần làm việc cuối trở đi");
        if (last && data.issuedAt && before.authorizedAt && data.issuedAt > before.authorizedAt) throw fail("Thời điểm cấp không được sau lần cho phép làm việc đầu tiên");
      }
      const saved = await tx.workPermit.updateMany({ where: { id: params.id, version: before.version }, data: { ...data, safetyItems: permitSnapshot(await resolvePermitSafety(tx, { ...body, format: data.format, teamType: data.teamType }, before)), status, version: { increment: 1 } } });
      if (saved.count !== 1) throw fail("Phiếu vừa được cập nhật ở phiên khác. Vui lòng tải lại.", 409);
      const after = await tx.workPermit.findUniqueOrThrow({ where: { id: params.id } });
      await tx.workPermitHistory.create({ data: { permitId: after.id, actorId: user.id, actorName: user.name ?? "", action: status === before.status ? "Cập nhật thông tin" : `Chuyển sang ${PERMIT_STATUSES[status]}`, before: permitSnapshot(before), after: permitSnapshot(after) } });
      return after;
    });
    await audit(user.id, "UPDATE_WORK_PERMIT", "WorkPermit", row.id, `Cập nhật PCT ${formatPermitNumber(row)}: ${PERMIT_STATUSES[status]}`);
    return ok(row);
  });
}
