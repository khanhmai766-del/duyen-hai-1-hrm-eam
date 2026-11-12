import { permitPositionVisible, permitPositionWhere, permitScopeOf } from "@/lib/server/work-permit-scope";
import { prisma } from "@/lib/prisma";
import { ok, requireUser } from "@/lib/api";
import { permitCapabilities } from "@/lib/server/work-permit-permissions";
import { permitHandle } from "@/lib/server/work-permits";
import { attendanceInside, attendanceTracked, type AttendanceVisit } from "@/lib/work-permit-attendance";
import { isSessionCommander } from "@/lib/work-permits";
import { sameCompany } from "@/lib/work-permit-card";
export const dynamic = "force-dynamic";

const LIVE_LIMIT = 300;
type Member ={ personId?: string | null; code?: string; attendance?: AttendanceVisit[] | null };

/**
 * Bảng "Đang làm việc" trên sổ PCT: mọi lần làm việc nhà thầu đang mở (chưa kết thúc), cả sổ Cơ và Điện,
 * kèm số người trong khu vực. Chỉ đọc — quét/kết thúc làm trên màn hình làm việc của từng phiếu.
 */
export async function GET() {
  return permitHandle(async () => {
    const user = await requireUser();
    // Lọc cương vị NGAY trong truy vấn: lọc sau `take` thì người bị giới hạn cương vị có thể mất phiếu của mình khi
    // toàn nhà máy vượt LIVE_LIMIT lần làm việc đang mở (đo 12/11/2026: 100).
    const scope = await permitScopeOf(user);
    const scopeWhere = await permitPositionWhere(scope);
    const [sessions, capabilities] = await Promise.all([
      prisma.workPermitSession.findMany({
        where: { endedAt: null, permit: scopeWhere ? { AND: [{ teamType: "CONTRACTOR" }, scopeWhere] } : { teamType: "CONTRACTOR" } },
        orderBy: { openedAt: "asc" },
        take: LIVE_LIMIT + 1,
        select: {
          id: true, commanderId: true, commanderCode: true, commanderName: true, company: true, members: true, openedAt: true, authorizerName: true,
          permit: { select: { id: true, number: true, nkvhNumber: true, year: true, kind: true, unit: true, content: true, location: true, position: true, teamName: true, progress: true } },
        },
      }),
      permitCapabilities(user),
    ]);
    const truncated = sessions.length > LIVE_LIMIT;
    if (truncated) console.warn(`Sổ PCT: bảng Đang làm việc vượt ${LIVE_LIMIT} lần làm việc đang mở — đã cắt bớt.`);
    // Mã đơn vị (tên gọi tắt) cho ô lọc nhà thầu — tra theo tên đơn vị ghi trên lần làm việc.
    const companies = await prisma.workPermitCompany.findMany({ where: { code: { not: "" } }, select: { name: true, code: true } });
    const codeOf = (company: string) => companies.find(row => sameCompany(row.name, company))?.code ?? "";
    const data = sessions.slice(0, LIVE_LIMIT).filter(session => permitPositionVisible(session.permit.position, scope)).map(({ members, permit, ...session }) => {
      const list = (Array.isArray(members) ? members : []) as Member[];
      // CHTT luôn có mặt suốt lần làm việc, không quét — tính riêng, cộng 1 ở phía hiển thị.
      const workers = list.filter(m => !isSessionCommander(m, session));
      return {
        ...session,
        companyCode: codeOf(session.company),
        openedAt: session.openedAt.toISOString(),
        permit,
        workers: workers.length,
        inside: workers.filter(attendanceInside).length,
        waiting: workers.filter(m => !attendanceTracked(m)).length,
      };
    });
    return ok(data, { canExecute: capabilities.canExecute, truncated });
  });
}
