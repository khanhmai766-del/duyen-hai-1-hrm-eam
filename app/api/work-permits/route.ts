import { parseOverhaulItems } from "@/lib/server/work-permit-overhaul";
import { permitPositionWhere, permitScopeOf, requirePermitPositionAllowed } from "@/lib/server/work-permit-scope";
import { positionViewScopeMeta } from "@/lib/position-data-scope";
import { permitIssueUpdateNeedsExecution } from "@/lib/work-permit-permissions";
import { requirePermitIssuer, requirePermitExecute, permitCapabilities } from "@/lib/server/work-permit-permissions";
import { resolvePermitSafety } from "@/lib/server/work-permit-safety";
import { workPermitPrisma as prisma } from "@/lib/server/work-permit-prisma";
import { audit, fail, ok, requireUser } from "@/lib/api";
import { formatPermitNumber, PERMIT_PAGE_SIZE } from "@/lib/work-permits";
import { parsePermit, permitBody, permitFilters, permitHandle, permitSnapshot, resolvePermitDefectLink } from "@/lib/server/work-permits";
import { resolvePermitIdentities } from "@/lib/server/work-permit-identities";
import { permitListSelect } from "@/lib/server/work-permit-selects";
import { startInternalPermitAutoClose } from "@/lib/server/work-permit-auto-close-runner";
import { consumePermitNumberReservation } from "@/lib/server/work-permit-number-reservations";
import type { PermitKind } from "@/lib/work-permits";
import { syncPermitDocument } from "@/lib/server/work-permit-document-store";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser();
    // Bảo đảm tác vụ được bật cả khi thêm instrumentation trong phiên next dev đang chạy.
    startInternalPermitAutoClose();
    // Phạm vi cương vị (lib/server/work-permit-scope.ts): chỉ phiếu của cương vị đang làm việc + cấp dưới + phiếu chung.
    const scope = await permitScopeOf(user);
    const scopeWhere = await permitPositionWhere(scope);
    const where = scopeWhere ? { AND: [permitFilters(req), scopeWhere] } : permitFilters(req);
    const page = Number(new URL(req.url).searchParams.get("page") || 1);
    if (!Number.isInteger(page) || page < 1 || page > 100000) return fail("Trang không hợp lệ");
    const filtered = permitFilters(req);
    const countBase = { ...filtered, status: undefined };
    const countWhere = scopeWhere ? { AND: [countBase, scopeWhere] } : countBase;
    const overhaulUrl = new URL(req.url);
    overhaulUrl.searchParams.delete("status");
    overhaulUrl.searchParams.delete("teamType");
    overhaulUrl.searchParams.delete("contractorScope");
    const overhaulBase = { ...permitFilters(new Request(overhaulUrl)), status: undefined, teamType: "CONTRACTOR", contractorScope: "OVERHAUL" };
    const overhaulWhere = scopeWhere ? { AND: [overhaulBase, scopeWhere] } : overhaulBase;
    const [rows, total, groups, overhaulCount] = await prisma.$transaction([
      prisma.workPermit.findMany({ where, select: permitListSelect, orderBy: [{ workDate: "desc" }, { createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * PERMIT_PAGE_SIZE, take: PERMIT_PAGE_SIZE }),
      prisma.workPermit.count({ where }),
      prisma.workPermit.groupBy({ by: ["status"], orderBy: { status: "asc" }, where: countWhere, _count: true }),
      prisma.workPermit.count({ where: overhaulWhere }),
    ]);
    return ok(rows, { total, page, pageSize: PERMIT_PAGE_SIZE, counts: Object.fromEntries(groups.map(g => [g.status, g._count])), overhaulCount, ...await permitCapabilities(user), positionScope: positionViewScopeMeta(scope) });
  });
}
export async function POST(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); requirePermitIssuer(user);
    const body = await permitBody(req);
    await requirePermitPositionAllowed(user, body.position);
    if (permitIssueUpdateNeedsExecution({}, body)) await requirePermitExecute(user);
    if (body.progress !== undefined && body.progress !== null) return fail("Chưa được cập nhật tiến độ khi tạo phiếu");
    const status = "ISSUED";
    if (body.status !== "ISSUED") return fail("Phiếu mới phải được lưu ở trạng thái Đã cấp");
    const row = await prisma.$transaction(async tx => {
      const linkedBody = await resolvePermitDefectLink(tx, body);
      const data = parsePermit(await resolvePermitIdentities(tx, linkedBody, user), status);
      if (data.teamType === "CONTRACTOR" && data.format !== "PAPER") throw fail("PCT nhà thầu chỉ sử dụng phiếu giấy");
      const overhaulItems = parseOverhaulItems(body.overhaulItems, data);
      const row = await tx.workPermit.create({ data: { ...data, ...(overhaulItems !== undefined ? { overhaulItems } : {}), safetyItems: permitSnapshot(await resolvePermitSafety(tx, body)), status, createdById: user.id, createdByName: user.name ?? "" } });
      await consumePermitNumberReservation(tx, { reservationId: body.reservationId, kind: data.kind as PermitKind,
        year: data.year, number: data.number, teamType: data.teamType, userId: user.id, userName: user.name ?? "",
        isAdmin: user.role === "ADMIN", permitId: row.id });
      await tx.workPermitHistory.create({ data: { permitId: row.id, actorId: user.id, actorName: user.name ?? "", action: "Tạo phiếu", after: permitSnapshot(row) } });
      return row;
    });
    await audit(user.id, "CREATE_WORK_PERMIT", "WorkPermit", row.id, `Tạo PCT ${formatPermitNumber(row)}`);
    await syncPermitDocument(row);
    return ok(row);
  });
}
