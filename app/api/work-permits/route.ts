import { resolvePermitSafety } from "@/lib/server/work-permit-safety";
import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireRole, requireUser } from "@/lib/api";
import { formatPermitNumber, PERMIT_PAGE_SIZE, PERMIT_WRITE_ROLES } from "@/lib/work-permits";
import { parsePermit, permitBody, permitFilters, permitHandle, permitSnapshot } from "@/lib/server/work-permits";
import { resolvePermitIdentities } from "@/lib/server/work-permit-identities";
import { permitListSelect } from "@/lib/server/work-permit-selects";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser();
    const where = permitFilters(req);
    const page = Number(new URL(req.url).searchParams.get("page") || 1);
    if (!Number.isInteger(page) || page < 1 || page > 100000) return fail("Trang không hợp lệ");
    const [rows, total, groups] = await prisma.$transaction([
      prisma.workPermit.findMany({ where, select: permitListSelect, orderBy: [{ workDate: "desc" }, { createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * PERMIT_PAGE_SIZE, take: PERMIT_PAGE_SIZE }),
      prisma.workPermit.count({ where }),
      prisma.workPermit.groupBy({ by: ["status"], orderBy: { status: "asc" }, where: { ...where, status: undefined }, _count: true }),
    ]);
    return ok(rows, { total, page, pageSize: PERMIT_PAGE_SIZE, counts: Object.fromEntries(groups.map(g => [g.status, g._count])), canWrite: PERMIT_WRITE_ROLES.includes(user.role) });
  });
}
export async function POST(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); requireRole(user, PERMIT_WRITE_ROLES);
    const body = await permitBody(req);
    const status = body.status === "ISSUED" ? "ISSUED" : "DRAFT";
    if (body.status !== "ISSUED" && body.status !== "DRAFT") return fail("Phiếu mới phải ở trạng thái Nháp hoặc Đã cấp");
    const row = await prisma.$transaction(async tx => {
      const data = parsePermit(await resolvePermitIdentities(tx, body, user), status);
      const row = await tx.workPermit.create({ data: { ...data, safetyItems: permitSnapshot(await resolvePermitSafety(tx, body)), status, createdById: user.id, createdByName: user.name ?? "" } });
      await tx.workPermitHistory.create({ data: { permitId: row.id, actorId: user.id, actorName: user.name ?? "", action: "Tạo phiếu", after: permitSnapshot(row) } });
      return row;
    });
    await audit(user.id, "CREATE_WORK_PERMIT", "WorkPermit", row.id, `Tạo PCT ${formatPermitNumber(row)}`);
    return ok(row);
  });
}
