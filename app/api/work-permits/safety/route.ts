import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireRole, requireUser } from "@/lib/api";
import { PERMIT_KINDS, PERMIT_WRITE_ROLES } from "@/lib/work-permits";
import { SAFETY_PAGE_SIZE } from "@/lib/work-permit-safety";
import { permitBody, permitHandle, permitSearchTerm } from "@/lib/server/work-permits";
import { parseSafetyItem } from "@/lib/server/work-permit-safety";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(), p = new URL(req.url).searchParams;
    const kind = p.get("kind") ?? "MECHANICAL", q = p.get("q") ?? "", page = Number(p.get("page") ?? 1);
    const active = p.get("active") ?? "1";
    if (!Object.hasOwn(PERMIT_KINDS, kind) || !["1", "0", "all"].includes(active)) return fail("Bộ lọc biện pháp không hợp lệ");
    if (!Number.isInteger(page) || page < 1 || page > 100000 || q.length > 200) return fail("Trang hoặc từ khóa không hợp lệ");
    const where = { kind, ...(active === "all" ? {} : { isActive: active === "1" }), ...(q.trim() ? { searchText: { contains: permitSearchTerm(q) } } : {}) };
    const [rows, total] = await prisma.$transaction([
      prisma.workPermitSafetyMeasure.findMany({ where, select: { id: true, kind: true, hazard: true, measure: true, source: true, isActive: true, version: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * SAFETY_PAGE_SIZE, take: SAFETY_PAGE_SIZE }),
      prisma.workPermitSafetyMeasure.count({ where }),
    ]);
    return ok(rows, { total, page, pageSize: SAFETY_PAGE_SIZE, canWrite: PERMIT_WRITE_ROLES.includes(user.role) });
  });
}
export async function POST(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); requireRole(user, PERMIT_WRITE_ROLES);
    const data = parseSafetyItem(await permitBody(req));
    const row = await prisma.workPermitSafetyMeasure.create({ data });
    await audit(user.id, "CREATE_PERMIT_SAFETY", "WorkPermitSafetyMeasure", row.id, JSON.stringify(data));
    return ok(row);
  });
}
