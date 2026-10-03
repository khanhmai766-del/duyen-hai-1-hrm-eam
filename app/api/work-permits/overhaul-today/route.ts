import { permitPositionVisible, permitScopeOf } from "@/lib/server/work-permit-scope";
import { prisma } from "@/lib/prisma";
import { ok, requireUser } from "@/lib/api";
import { permitCapabilities } from "@/lib/server/work-permit-permissions";
import { permitHandle } from "@/lib/server/work-permits";
import { isOverhaulPaperPermit, latestOverhaulPercents, overhaulItemsOf } from "@/lib/work-permit-overhaul";
export const dynamic = "force-dynamic";

/**
 * Màn hình "Tiến độ trong ngày": mọi PCT nhà thầu · Đại tu có hạng mục đang có lần làm việc MỞ, để ghi tiến độ nhiều
 * phiếu một lượt. Mỗi phiếu kèm hạng mục, % lũy kế gần nhất và `version` — lưu vẫn đi qua API lần làm việc của từng
 * phiếu (action "progress"), nên mọi kiểm tra (lũy kế, đủ hạng mục, hàng đợi Sheet) giữ nguyên một chỗ.
 */
export async function GET() {
  return permitHandle(async () => {
    const user = await requireUser();
    const [sessions, capabilities, scope] = await Promise.all([
      prisma.workPermitSession.findMany({
        where: { endedAt: null, permit: { teamType: "CONTRACTOR", contractorScope: "OVERHAUL", status: "ACTIVE" } },
        orderBy: { openedAt: "asc" },
        take: 200,
        select: {
          id: true, commanderName: true, commanderCode: true, openedAt: true, itemProgress: true,
          permit: { select: { id: true, number: true, year: true, kind: true, unit: true, content: true, location: true, position: true, teamName: true, version: true, format: true, teamType: true, contractorScope: true, overhaulItems: true, plannedEndAt: true } },
        },
      }),
      permitCapabilities(user),
      permitScopeOf(user),
    ]);
    const visible = sessions.filter(s => permitPositionVisible(s.permit.position, scope) && isOverhaulPaperPermit(s.permit) && overhaulItemsOf(s.permit.overhaulItems).length > 0);
    // % lũy kế gần nhất từng hạng mục: lần đang mở trước, rồi các lần đã kết thúc (mới nhất trước).
    const ended = visible.length ? await prisma.workPermitSession.findMany({
      where: { permitId: { in: visible.map(s => s.permit.id) }, endedAt: { not: null } },
      orderBy: { endedAt: "desc" },
      select: { permitId: true, itemProgress: true },
    }) : [];
    const data = visible.map(({ permit, itemProgress, ...session }) => {
      const history = [{ itemProgress }, ...ended.filter(e => e.permitId === permit.id)];
      const { overhaulItems, format: _format, teamType: _teamType, contractorScope: _scope, ...rest } = permit;
      return {
        ...session,
        openedAt: session.openedAt.toISOString(),
        itemProgress,
        permit: { ...rest, plannedEndAt: rest.plannedEndAt?.toISOString() ?? null, overhaulItems: overhaulItemsOf(overhaulItems) },
        percents: Object.fromEntries(latestOverhaulPercents(history)),
      };
    });
    return ok(data, { canExecute: capabilities.canExecute });
  });
}
