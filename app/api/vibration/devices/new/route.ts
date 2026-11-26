import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok } from "@/lib/api";
import { DEFAULT_ALERT } from "@/lib/vibration/constants";
import { deviceCreateSchema, defaultMeasurementConfig, emptyLabels } from "@/lib/vibration/catalog";
import { buildUpdate, sameDeviceKey } from "@/lib/vibration/catalog-server";
import { assertVibrationAreasEditable, requireVibrationManage, toDeviceDto } from "@/lib/vibration/server";

export const dynamic = "force-dynamic";

/** Tạo thiết bị đo độ rung mới (legacyId = NEW-<uuid> như app cũ). Cần vibration-manage.
 *  Body: { area, name, system?, active?, sortOrder?, measureGroups?, measurementConfig?, alertConfig?, machine? }. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireVibrationManage();
    const parsed = deviceCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ", 400);
    const p = parsed.data;
    assertVibrationAreasEditable(user, [{ area: p.area, name: p.name }]);
    const key = { area: p.area, system: p.system ?? "", name: p.name };
    const same = await prisma.vibrationDevice.findMany({ where: { area: p.area }, select: { area: true, system: true, name: true, sortOrder: true } });
    if (same.some((d) => sameDeviceKey(d, key))) return fail("Thiết bị đã tồn tại trong cương vị và hệ thống này.", 409);

    const created = await prisma.vibrationDevice.create({
      data: {
        legacyId: `NEW-${randomUUID()}`,
        area: p.area, system: key.system, name: p.name,
        active: p.active ?? true,
        sortOrder: p.sortOrder ?? Math.max(0, ...same.map((d) => d.sortOrder)) + 1,
        labels: emptyLabels(),
        measurementConfig: defaultMeasurementConfig() as unknown as Prisma.InputJsonValue,
        alertConfig: { ...DEFAULT_ALERT } as Prisma.InputJsonValue,
        measureGroups: p.measureGroups ?? [],
      },
    });
    // Cấu hình vùng đo / ngưỡng / máy đi kèm: dùng chung đường gộp với PATCH để cùng kiểm tra.
    let final = created;
    try {
      const extra = buildUpdate(created, { measurementConfig: p.measurementConfig, alertConfig: p.alertConfig, machine: p.machine });
      if (Object.keys(extra).length) final = await prisma.vibrationDevice.update({ where: { id: created.id }, data: extra });
    } catch (e) {
      await prisma.vibrationDevice.delete({ where: { id: created.id } });
      throw e;
    }
    await audit(user.id, "VIBRATION_DEVICE_CREATE", "VibrationDevice", final.id, `${final.name} (${final.legacyId})`, { afterData: final });
    return ok(toDeviceDto(final));
  });
}
