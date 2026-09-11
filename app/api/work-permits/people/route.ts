import { requirePermitIssue, permitCapabilities } from "@/lib/server/work-permit-permissions";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireUser } from "@/lib/api";
import { permitBody, permitHandle, permitSearchTerm } from "@/lib/server/work-permits";
import { parsePermitPerson } from "@/lib/server/work-permit-people";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser();
    const p = new URL(req.url).searchParams, q = p.get("q") ?? "";
    const page = Number(p.get("page") || 1);
    if (q.length > 200 || !Number.isInteger(page) || page < 1 || page > 100000) return fail("Bộ lọc danh bạ không hợp lệ");
    const where = { searchText: { contains: permitSearchTerm(q) }, ...(p.get("active") === "1" ? { isActive: true } : {}), ...(p.get("commander") === "1" ? { canCommand: true } : {}) };
    const [rows, total] = await prisma.$transaction([
      prisma.workPermitPerson.findMany({ where, select: { id: true, code: true, name: true, company: true, canCommand: true, isActive: true, version: true }, orderBy: [{ name: "asc" }, { code: "asc" }], skip: (page - 1) * 25, take: 25 }),
      prisma.workPermitPerson.count({ where }),
    ]);
    const activeSessions = rows.length ? await prisma.workPermitSession.findMany({
      where: { endedAt: null, OR: [
        { commanderId: { in: rows.map(person => person.id) } },
        ...rows.flatMap(person => [
          { members: { array_contains: [{ personId: person.id }] } },
          { members: { array_contains: [{ code: person.code }] } },
        ]),
      ] },
      select: { id: true, commanderId: true, members: true, openedAt: true, permit: { select: { id: true, number: true, year: true, kind: true } } },
      orderBy: { openedAt: "asc" },
    }) : [];
    return ok(rows.map(person => ({ ...person, activeWork: activeSessions.find(session => session.commanderId === person.id) ? { openedAt: activeSessions.find(session => session.commanderId === person.id)!.openedAt, permit: activeSessions.find(session => session.commanderId === person.id)!.permit } : null,
      activeWorks: activeSessions.filter(session => session.commanderId === person.id || (Array.isArray(session.members) && session.members.some(member => {
        if (!member || typeof member !== "object" || Array.isArray(member)) return false;
        return member.personId ? member.personId === person.id : member.code === person.code;
      }))).map(session => ({ sessionId: session.id, role: session.commanderId === person.id ? "CHTT" : "MEMBER", openedAt: session.openedAt, permit: session.permit })),
    })), { total, canWrite: (await permitCapabilities(user)).canIssue });
  });
}
export async function POST(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const data = parsePermitPerson(await permitBody(req));
    try {
      const row = await prisma.workPermitPerson.create({ data });
      await audit(user.id, "CREATE_WORK_PERMIT_PERSON", "WorkPermitPerson", row.id, `Thêm ${row.code}: ${row.name} · ${row.company}`);
      return ok(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fail("Số thẻ an toàn đã tồn tại. Hãy chọn hồ sơ đó để dùng chung giữa các PCT.", 409);
      throw e;
    }
  });
}
