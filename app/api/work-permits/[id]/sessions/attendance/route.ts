import { prisma } from "@/lib/prisma";
import { fail, ok, requireUser } from "@/lib/api";
import { requirePermitExecute } from "@/lib/server/work-permit-permissions";
import { permitBody, permitHandle, permitText } from "@/lib/server/work-permits";
import { recordAttendance } from "@/lib/server/work-permit-attendance";
export const dynamic = "force-dynamic";

/**
 * Quét VÀO / RA vị trí làm việc trong lần làm việc đang mở (nghiệp vụ ở lib/server/work-permit-attendance.ts).
 * Không đòi `version` của phiếu: nhiều cổng quét cùng lúc, mỗi lượt khoá riêng dòng lần làm việc.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitExecute(user);
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
