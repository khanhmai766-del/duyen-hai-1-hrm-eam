import { audit, fail, ok, requireRole, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { permitBody, permitHandle } from "@/lib/server/work-permits";
import { mergeOverhaulSchedules as merged, readStoredOverhaulSchedules as readStored } from "@/lib/server/overhaul-schedules";
import { permitCapabilities } from "@/lib/server/work-permit-permissions";
import {
  OVERHAUL_SCHEDULE_CONFIG_KEY, OVERHAUL_SCHEDULE_DEFAULTS, OVERHAUL_SCHEDULE_TITLE_MAX, overhaulScheduleUrlError,
  type OverhaulScheduleId,
} from "@/lib/work-permit-overhaul";
export const dynamic = "force-dynamic";

/** GET — 4 link Google Sheets theo dõi tiến độ đại tu (mục "Tiến độ đại tu" của sổ PCT). */
export async function GET() {
  return permitHandle(async () => {
    const user = await requireUser();
    // Số hạng mục gợi ý đang có theo file + loại PCT, và lần đồng bộ gần nhất (hiện trên bảng Tiến độ đại tu).
    const [groups, last, capabilities] = await Promise.all([
      prisma.workPermitOverhaulItem.groupBy({ by: ["source", "kind"], where: { isActive: true }, _count: true }).catch(() => []),
      prisma.workPermitOverhaulItem.aggregate({ _max: { syncedAt: true } }).catch(() => null),
      permitCapabilities(user),
    ]);
    const items: Record<string, { mechanical: number; electrical: number }> = {};
    for (const group of groups) {
      const entry = (items[group.source] ??= { mechanical: 0, electrical: 0 });
      if (group.kind === "MECHANICAL") entry.mechanical += group._count; else entry.electrical += group._count;
    }
    // Chỉ Quản trị sửa được link (file tiến độ dùng chung của cả phân xưởng); người khác chỉ xem và mở.
    // Đồng bộ hạng mục: cùng quyền với nút Đồng bộ trong hộp chọn hạng mục (người cấp/sửa phiếu).
    return ok(merged(await readStored()), {
      canWrite: user.role === "ADMIN",
      canSync: capabilities.canIssue,
      items,
      itemsSyncedAt: last?._max.syncedAt ?? null,
    });
  });
}

/** PUT { id, title, url } — sửa tiêu đề cột Theo dõi và/hoặc link sheet của một dòng. Chỉ Quản trị. */
export async function PUT(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); requireRole(user, ["ADMIN"]);
    const body = await permitBody(req);
    const id = String(body.id ?? "") as OverhaulScheduleId;
    if (!OVERHAUL_SCHEDULE_DEFAULTS.some(item => item.id === id)) return fail("Dòng tiến độ không hợp lệ");
    const title = String(body.title ?? "").replace(/\s+/g, " ").trim();
    if (!title) return fail("Vui lòng nhập tên theo dõi");
    if (title.length > OVERHAUL_SCHEDULE_TITLE_MAX) return fail(`Tên theo dõi tối đa ${OVERHAUL_SCHEDULE_TITLE_MAX} ký tự`);
    const url = String(body.url ?? "").trim();
    const urlError = overhaulScheduleUrlError(url);
    if (urlError) return fail(urlError);

    const stored = await readStored();
    const before = merged(stored).find(item => item.id === id)!;
    stored[id] = { title, url, updatedAt: new Date().toISOString(), updatedBy: user.name ?? "" };
    await prisma.rbacConfig.upsert({
      where: { key: OVERHAUL_SCHEDULE_CONFIG_KEY },
      create: { key: OVERHAUL_SCHEDULE_CONFIG_KEY, value: JSON.stringify(stored), updatedById: user.id },
      update: { value: JSON.stringify(stored), updatedById: user.id, updatedAt: new Date() },
    });
    await audit(user.id, "UPDATE_OVERHAUL_SCHEDULE_LINK", "WorkPermitOverhaulSchedule", id,
      `Sửa tiến độ đại tu "${before.title}"${before.title !== title ? ` → "${title}"` : ""}${before.url !== url ? " (đổi link sheet)" : ""}`, {
        actorName: user.name, beforeData: before, afterData: { id, title, url },
      });
    return ok(merged(stored).find(item => item.id === id));
  });
}
