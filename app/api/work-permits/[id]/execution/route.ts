import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireUser } from "@/lib/api";
import { requirePermitExecute } from "@/lib/server/work-permit-permissions";
import { isPermitExecutionInput, PERMIT_EXECUTION_STATUSES } from "@/lib/work-permit-permissions";
import { parsePermit, permitBody, permitHandle, permitSnapshot } from "@/lib/server/work-permits";
import { formatPermitNumber, PERMIT_STATUSES, PERMIT_TRANSITIONS, CONTRACTOR_PERMIT_TRANSITIONS, type PermitStatus } from "@/lib/work-permits";

export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return permitHandle(async () => {
    const user = await requireUser();
    await requirePermitExecute(user);
    const body = await permitBody(req);
    if (!isPermitExecutionInput(body)) return fail("Thao tác thực hiện không được thay đổi thông tin cấp phiếu", 403);
    const row = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${params.id} FOR UPDATE`;
      const before = await tx.workPermit.findUnique({ where: { id: params.id } });
      if (!before) throw fail("Không tìm thấy PCT", 404);
      if (["DRAFT", "CLOSED", "CANCELLED"].includes(before.status)) throw fail("Chỉ thực hiện phiếu đã cấp và chưa đóng hoặc hủy", 409);
      if (body.version !== before.version) throw fail("Phiếu đã thay đổi. Vui lòng tải lại trước khi thao tác.", 409);
      const status = String(body.status ?? before.status) as PermitStatus;
      if (status !== before.status) {
        const transitions = before.teamType === "CONTRACTOR" ? CONTRACTOR_PERMIT_TRANSITIONS : PERMIT_TRANSITIONS;
        if (!(PERMIT_EXECUTION_STATUSES as readonly string[]).includes(status) || !transitions[before.status as PermitStatus].includes(status)) throw fail("Không thể chuyển sang trạng thái thực hiện này", 409);
      }
      let progress = before.progress;
      if (body.progress !== undefined) {
        if (typeof body.progress !== "number" || !Number.isInteger(body.progress) || body.progress < 0 || body.progress > 100) throw fail("Tiến độ phải là số nguyên từ 0 đến 100%");
        if (!["ACTIVE", "PAUSED", "WAITING", "CLOSED"].includes(status)) throw fail("Chỉ cập nhật tiến độ khi phiếu đã vào làm việc");
        progress = body.progress;
      }
      const source = { ...JSON.parse(JSON.stringify(before)), ...body, status };
      const data = parsePermit(source, status);
      if (before.authorizedAt && !data.authorizedAt) throw fail("Không được xóa thời điểm cho phép đã ghi nhận", 409);
      if (before.teamType === "CONTRACTOR") {
        if (data.authorizerName !== before.authorizerName || (data.authorizedAt?.getTime() ?? null) !== (before.authorizedAt?.getTime() ?? null)) throw fail("Cho phép nhà thầu vào làm việc phải ghi qua chức năng mở lần làm việc", 409);
        if (status === "CLOSED") {
          const live = await tx.workPermitSession.findFirst({ where: { permitId: before.id, endedAt: null } });
          const last = await tx.workPermitSession.findFirst({ where: { permitId: before.id }, orderBy: { openedAt: "desc" } });
          if (live || !last?.endedAt || !data.closedAt || data.closedAt < last.endedAt) throw fail("Cần kết thúc lần làm việc cuối trước khi đóng PCT", 409);
        }
      }
      const after = await tx.workPermit.update({ where: { id: before.id }, data: {
        status, progress, authorizerName: data.authorizerName, authorizedAt: data.authorizedAt,
        closedAt: data.closedAt, result: data.result, statusReason: data.statusReason,
        searchText: data.searchText, version: { increment: 1 },
      } });
      await tx.workPermitHistory.create({ data: { permitId: after.id, actorId: user.id, actorName: user.name ?? "", action: status === before.status ? "Cập nhật thực hiện / tiến độ" : `Chuyển sang ${PERMIT_STATUSES[status]}`, before: permitSnapshot(before), after: permitSnapshot(after) } });
      return after;
    });
    await audit(user.id, "EXECUTE_WORK_PERMIT", "WorkPermit", row.id, `Thực hiện PCT ${formatPermitNumber(row)}`);
    return ok(row);
  });
}
