import { requirePermitVisible } from "@/lib/server/work-permit-scope";
import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireRole, requireUser } from "@/lib/api";
import { requirePermitExecute } from "@/lib/server/work-permit-permissions";
import { permitBody, permitHandle, permitText } from "@/lib/server/work-permits";
import { recordAttendance, removeSessionMember } from "@/lib/server/work-permit-attendance";
import { formatPermitNumber } from "@/lib/work-permits";
export const dynamic = "force-dynamic";

/**
 * Quét VÀO / RA vị trí làm việc trong lần làm việc đang mở (nghiệp vụ ở lib/server/work-permit-attendance.ts).
 * Không đòi `version` của phiếu: nhiều cổng quét cùng lúc, mỗi lượt khoá riêng dòng lần làm việc.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitExecute(user);
    await requirePermitVisible(user, params.id);
    const body = await permitBody(req);
    const direction = body.direction;
    if (direction !== "auto" && direction !== "in" && direction !== "out") return fail("Hướng vào/ra không hợp lệ");
    const sessionId = permitText(body, "sessionId", 100);
    if (!sessionId) return fail("Thiếu lần làm việc");
    const personId = permitText(body, "personId", 100) || undefined;
    const index = typeof body.index === "number" ? body.index : undefined;
    const result = await prisma.$transaction(tx => recordAttendance(tx, {
      permitId: params.id, sessionId, direction, personId, index, name: permitText(body, "name"),
    }));
    return ok(result);
  });
}

/**
 * Quản trị (đang bật chế độ quản trị) GỠ HẲN một nhân viên đã ra / chưa vào khỏi lần làm việc và khỏi danh sách nhân
 * viên trên phiếu — mất vết trên phiếu, chỉ còn ở nhật ký quản trị. Nghiệp vụ: removeSessionMember.
 */
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return permitHandle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    await requirePermitVisible(user, params.id);
    const body = await permitBody(req);
    const sessionId = permitText(body, "sessionId", 100);
    if (!sessionId) return fail("Thiếu lần làm việc");
    const personId = permitText(body, "personId", 100) || undefined;
    const index = typeof body.index === "number" ? body.index : undefined;
    const result = await prisma.$transaction(tx => removeSessionMember(tx, { permitId: params.id, sessionId, personId, index, name: permitText(body, "name") }));
    const permit = await prisma.workPermit.findUnique({ where: { id: params.id }, select: { number: true, year: true, kind: true } });
    await audit(user.id, "REMOVE_WORK_PERMIT_SESSION_MEMBER", "WorkPermit", params.id,
      `Gỡ ${result.member.name}${result.member.code ? ` (${result.member.code})` : ""} khỏi lần làm việc PCT ${permit ? formatPermitNumber(permit) : params.id} · xoá ${result.visits} lượt vào/ra${result.removedFromPermit ? " · bỏ khỏi danh sách nhân viên trên phiếu" : ""}`);
    return ok(result);
  });
}
