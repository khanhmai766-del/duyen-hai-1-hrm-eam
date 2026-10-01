import { prisma } from "@/lib/prisma";
import { OVERHAUL_SCHEDULE_CONFIG_KEY, OVERHAUL_SCHEDULE_DEFAULTS, type OverhaulScheduleId, type OverhaulScheduleLink } from "@/lib/work-permit-overhaul";

/** Bảng "Tiến độ đại tu" (RbacConfig): giá trị đã lưu đè lên mặc định theo `id`. Dùng chung cho API và đồng bộ hạng mục. */
export type StoredOverhaulSchedules = Partial<Record<OverhaulScheduleId, { title?: string; url?: string; updatedAt?: string; updatedBy?: string }>>;

export async function readStoredOverhaulSchedules(): Promise<StoredOverhaulSchedules> {
  const row = await prisma.rbacConfig.findUnique({ where: { key: OVERHAUL_SCHEDULE_CONFIG_KEY } });
  if (!row?.value) return {};
  try { return JSON.parse(row.value) as StoredOverhaulSchedules; } catch { return {}; }
}

export function mergeOverhaulSchedules(stored: StoredOverhaulSchedules): OverhaulScheduleLink[] {
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

export async function overhaulScheduleLinks() {
  return mergeOverhaulSchedules(await readStoredOverhaulSchedules());
}
