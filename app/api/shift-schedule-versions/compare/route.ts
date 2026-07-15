import { fail, handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "shift-schedule-view", ["read", "manage", "full"]);
    const params = new URL(req.url).searchParams;
    const leftId = params.get("left"), rightId = params.get("right");
    if (!leftId || !rightId) return fail("Chọn đủ hai phiên bản cần so sánh");
    const [left, right] = await Promise.all([
      prisma.shiftScheduleVersion.findUnique({ where: { id: leftId }, include: { entries: true } }),
      prisma.shiftScheduleVersion.findUnique({ where: { id: rightId }, include: { entries: true } }),
    ]);
    if (!left || !right) return fail("Không tìm thấy phiên bản cần so sánh", 404);
    const key = (item: (typeof left.entries)[number]) =>
      `${item.date.toISOString().slice(0, 10)}:${item.shiftType}:${item.positionConfigId}:${item.stationCode ?? "NONE"}:${item.employeeId}`;
    const leftKeys = new Set(left.entries.map(key)), rightKeys = new Set(right.entries.map(key));
    const added = right.entries.filter((item) => !leftKeys.has(key(item)));
    const removed = left.entries.filter((item) => !rightKeys.has(key(item)));
    const affectedEmployees = new Set([...added, ...removed].map((item) => item.employeeId));
    const warnings = Array.isArray(right.generationWarnings) ? right.generationWarnings : [];
    return ok({
      left: { id: left.id, versionNumber: left.versionNumber },
      right: { id: right.id, versionNumber: right.versionNumber },
      summary: {
        totalEntries: right.entries.length,
        unchanged: right.entries.length - added.length,
        added: added.length,
        removed: removed.length,
        changed: added.length + removed.length,
        warnings: warnings.length,
        affectedEmployees: affectedEmployees.size,
      },
      added,
      removed,
      warnings,
    });
  });
}
