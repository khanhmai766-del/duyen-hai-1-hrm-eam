import { audit, fail, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { permitCapabilities, requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { permitBody, permitHandle } from "@/lib/server/work-permits";
import {
  OVERHAUL_SCHEDULE_CONFIG_KEY, OVERHAUL_SCHEDULE_DEFAULTS, OVERHAUL_SCHEDULE_TITLE_MAX, overhaulScheduleUrlError,
  type OverhaulScheduleId, type OverhaulScheduleLink,
} from "@/lib/work-permit-overhaul";
export const dynamic = "force-dynamic";

type Stored = Partial<Record<OverhaulScheduleId, { title?: string; url?: string; updatedAt?: string; updatedBy?: string }>>;

async function readStored(): Promise<Stored> {
  const row = await prisma.rbacConfig.findUnique({ where: { key: OVERHAUL_SCHEDULE_CONFIG_KEY } });
  if (!row?.value) return {};
  try { return JSON.parse(row.value) as Stored; } catch { return {}; }
}

function merged(stored: Stored): OverhaulScheduleLink[] {
  return OVERHAUL_SCHEDULE_DEFAULTS.map(item => {
    const saved = stored[item.id];
    return {
      id: item.id,
      title: saved?.title?.trim() || item.title,
      url: saved?.url !== undefined ? saved.url : item.url,
      updatedAt: saved?.updatedAt ?? null,
      updatedBy: saved?.updatedBy ?? null,
    };
  });
}

/** GET — 4 link Google Sheets theo dõi tiến độ đại tu (mục "Tiến độ đại tu" của sổ PCT). */
export async function GET() {
  return permitHandle(async () => {
    const user = await requireUser();
    return ok(merged(await readStored()), { canWrite: (await permitCapabilities(user)).canIssue });
  });
}

/** PUT { id, title, url } — sửa tiêu đề cột Theo dõi và/hoặc link sheet của một dòng. */
export async function PUT(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
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
