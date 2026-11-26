import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok } from "@/lib/api";
import { bulkSchema } from "@/lib/vibration/catalog";
import { buildUpdate } from "@/lib/vibration/catalog-server";
import { assertVibrationAreasEditable, requireVibrationManage, requireVibrationView } from "@/lib/vibration/server";

export const dynamic = "force-dynamic";

/** Số bản ghi đo của từng thiết bị: data = { [deviceId]: số bản ghi } (chỉ thiết bị có bản ghi). Cần vibration-view. */
export async function GET() {
  return handle(async () => {
    await requireVibrationView();
    const rows = await prisma.vibrationRecord.groupBy({ by: ["deviceId"], _count: { _all: true } });
    return ok(Object.fromEntries(rows.map((r) => [r.deviceId, r._count._all])));
  });
}

/** Lưu cấu hình nhiều thiết bị một lần (trang Cấu hình vùng đo, thao tác hàng loạt). Cần vibration-manage.
 *  Body: { items: [{ id, ...patch }] } — patch giống PATCH /api/vibration/devices/[id]; tối đa 500 mục.
 *  Tất cả hoặc không: một mục sai thì không mục nào được ghi. Trả data: { updated: số thiết bị }. */
export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const user = await requireVibrationManage();
    const parsed = bulkSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ", 400);
    const items = parsed.data.items;
    if (new Set(items.map((i) => i.id)).size !== items.length) return fail("Danh sách có thiết bị trùng", 400);
    const rows = await prisma.vibrationDevice.findMany({ where: { id: { in: items.map((i) => i.id) } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const missing = items.find((i) => !byId.has(i.id));
    if (missing) return fail("Có thiết bị không còn tồn tại, hãy tải lại trang", 404);

    assertVibrationAreasEditable(user, rows);

    const planned = items.map(({ id, ...patch }) => {
      const row = byId.get(id)!;
      if (patch.area !== undefined || patch.system !== undefined || patch.name !== undefined) {
        throw fail("Thao tác hàng loạt không đổi tên / cương vị / hệ thống", 400);
      }
      if (patch.machine && "sparePair" in patch.machine) throw fail("Cặp dự phòng chỉ sửa từng thiết bị", 400);
      return { row, patch, data: buildUpdate(row, patch) };
    });
    await prisma.$transaction(planned.map((p) => prisma.vibrationDevice.update({ where: { id: p.row.id }, data: p.data })));
    const fields = [...new Set(planned.flatMap((p) => Object.keys(p.patch)))];
    await audit(user.id, "VIBRATION_DEVICE_BULK_UPDATE", "VibrationDevice", undefined, `${planned.length} thiết bị: ${fields.join(", ")}`, {
      beforeData: planned.slice(0, 20).map((p) => ({ id: p.row.id, legacyId: p.row.legacyId, name: p.row.name })), changedFields: fields,
    });
    return ok({ updated: planned.length });
  });
}
