import { prisma } from "@/lib/prisma";
import { ok, requireUser } from "@/lib/api";
import { permitCapabilities } from "@/lib/server/work-permit-permissions";
import { permitHandle } from "@/lib/server/work-permits";
import { attendanceInside, attendanceTracked, type AttendanceVisit } from "@/lib/work-permit-attendance";
export const dynamic = "force-dynamic";

type Member = { personId?: string | null; code?: string; attendance?: AttendanceVisit[] | null };

/**
 * Bảng "Đang làm việc" trên sổ PCT: mọi lần làm việc nhà thầu đang mở (chưa kết thúc), cả sổ Cơ và Điện,
 * kèm số người trong khu vực. Chỉ đọc — quét/kết thúc làm trên màn hình làm việc của từng phiếu.
 */
export async function GET() {
  return permitHandle(async () => {
    const user = await requireUser();
    const [sessions, capabilities] = await Promise.all([
      prisma.workPermitSession.findMany({
        where: { endedAt: null, permit: { teamType: "CONTRACTOR" } },
        orderBy: { openedAt: "asc" },
        take: 300,
        select: {
          id: true, commanderId: true, commanderCode: true, commanderName: true, company: true, members: true, openedAt: true, authorizerName: true,
          permit: { select: { id: true, number: true, year: true, kind: true, unit: true, content: true, location: true, position: true, teamName: true, progress: true } },
        },
      }),
      permitCapabilities(user),
    ]);
    const data = sessions.map(({ members, permit, ...session }) => {
      const list = (Array.isArray(members) ? members : []) as Member[];
      // CHTT luôn có mặt suốt lần làm việc, không quét — tính riêng, cộng 1 ở phía hiển thị.
      const workers = list.filter(m => m.personId ? m.personId !== session.commanderId : m.code !== session.commanderCode);
      return {
        ...session,
        openedAt: session.openedAt.toISOString(),
        permit,
        workers: workers.length,
        inside: workers.filter(attendanceInside).length,
        waiting: workers.filter(m => !attendanceTracked(m)).length,
      };
    });
    return ok(data, { canExecute: capabilities.canExecute });
  });
}
