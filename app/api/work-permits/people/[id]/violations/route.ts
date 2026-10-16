import { audit, fail, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { formatPermitNumber } from "@/lib/work-permits";
import { recordPermitPersonViolation, requireViolationSessionMember } from "@/lib/server/work-permit-person-violations";
import { requirePermitExecute, requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { requirePermitVisible } from "@/lib/server/work-permit-scope";
import { permitBody, permitHandle } from "@/lib/server/work-permits";

export const dynamic = "force-dynamic";

/** Ghi ngay trên PCT dùng quyền thực hiện, chỉ cho nhân viên thuộc đúng lần làm việc. */
async function violationContext(user: Awaited<ReturnType<typeof requireUser>>, personId: string, body: Record<string, unknown>) {
  if (body.permitId === undefined && body.sessionId === undefined) {
    await requirePermitIssue(user);
    return undefined;
  }
  if (typeof body.permitId !== "string" || !body.permitId || body.permitId.length > 100 || typeof body.sessionId !== "string" || !body.sessionId || body.sessionId.length > 100)
    throw fail("Phiếu công tác hoặc lần làm việc không hợp lệ");
  await requirePermitExecute(user);
  await requirePermitVisible(user, body.permitId);
  const session = await prisma.workPermitSession.findFirst({
    where: { id: body.sessionId, permitId: body.permitId, endedAt: null },
    select: { members: true, permit: { select: { id: true, number: true, nkvhNumber: true, year: true } } },
  });
  if (!session) throw fail("Lần làm việc đã kết thúc hoặc không tồn tại. Vui lòng tải lại PCT.", 409);
  requireViolationSessionMember(session.members, personId);
  return { permitId: body.permitId, sessionId: body.sessionId, permitNumber: formatPermitNumber(session.permit) };
}

/** Luôn đọc hồ sơ hiện tại, không dùng version hoặc tên trong bản chụp nhân viên trên PCT. */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  return permitHandle(async () => {
    const user = await requireUser();
    const { id } = await props.params;
    const params = new URL(req.url).searchParams;
    await violationContext(user, id, {
      ...(params.has("permitId") ? { permitId: params.get("permitId") } : {}),
      ...(params.has("sessionId") ? { sessionId: params.get("sessionId") } : {}),
    });
    const person = await prisma.workPermitPerson.findUnique({ where: { id }, select: { id: true, name: true, code: true, company: true, version: true, violations: true } });
    if (!person) return fail("Không tìm thấy hồ sơ nhân sự. Vui lòng kiểm tra danh bạ nhà thầu.", 404);
    return ok(person);
  });
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  return permitHandle(async () => {
    const user = await requireUser();
    const { id } = await props.params;
    const body = await permitBody(req);
    const context = await violationContext(user, id, body);
    const { row, violation } = await recordPermitPersonViolation(id, body, user, prisma, context);
    await audit(user.id, "RECORD_WORK_PERMIT_PERSON_VIOLATION", "WorkPermitPerson", id, `${row.code}: ${row.name}${context ? ` · PCT ${context.permitNumber}` : ""} · ${violation.description}`);
    return ok(row);
  });
}
