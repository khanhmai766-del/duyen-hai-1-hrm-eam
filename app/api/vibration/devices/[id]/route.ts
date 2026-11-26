import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireRole } from "@/lib/api";
import { devicePatchSchema } from "@/lib/vibration/catalog";
import { buildUpdate, sameDeviceKey, syncSparePair } from "@/lib/vibration/catalog-server";
import { requireVibrationManage, requireVibrationView, toDeviceDto } from "@/lib/vibration/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function withNames(row: Parameters<typeof toDeviceDto>[0]) {
  const seqs = [row.equipmentSeq, row.suggestSeq].filter((x): x is string => !!x);
  const nodes = seqs.length ? await prisma.equipmentNode.findMany({ where: { seq: { in: seqs } }, select: { seq: true, name: true } }) : [];
  const nm = new Map(nodes.map((n) => [n.seq, n.name]));
  return toDeviceDto(row, row.equipmentSeq ? nm.get(row.equipmentSeq) ?? null : null, row.suggestSeq ? nm.get(row.suggestSeq) ?? null : null);
}

/** Một thiết bị đo độ rung (id nội bộ hoặc mã cũ legacyId) kèm số bản ghi đo. Cần vibration-view. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await requireVibrationView();
    const { id } = await ctx.params;
    const row = await prisma.vibrationDevice.findFirst({ where: { OR: [{ id }, { legacyId: id }] } });
    if (!row) return fail("Không tìm thấy thiết bị độ rung", 404);
    const recordCount = await prisma.vibrationRecord.count({ where: { deviceId: row.id } });
    return ok({ ...(await withNames(row)), recordCount });
  });
}

/** Sửa thiết bị (patch từng phần): area, system, name, active, sortOrder, measureGroups, measurementConfig, alertConfig, machine.
 *  Cần vibration-manage. measurementConfig / alertConfig / machine được GỘP vào giá trị đang lưu. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireVibrationManage();
    const { id } = await ctx.params;
    const parsed = devicePatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ", 400);
    const patch = parsed.data;
    const row = await prisma.vibrationDevice.findUnique({ where: { id } });
    if (!row) return fail("Không tìm thấy thiết bị độ rung", 404);

    const next = { area: patch.area ?? row.area, system: patch.system ?? row.system, name: patch.name ?? row.name };
    if (patch.area !== undefined || patch.system !== undefined || patch.name !== undefined) {
      const same = await prisma.vibrationDevice.findMany({ where: { area: next.area, id: { not: row.id } }, select: { area: true, system: true, name: true } });
      if (same.some((d) => sameDeviceKey(d, next))) return fail("Thiết bị đã tồn tại trong cương vị và hệ thống này.", 409);
    }
    const data = buildUpdate(row, patch);
    const updated = await prisma.$transaction(async (tx) => {
      if (patch.machine && "sparePair" in patch.machine) await syncSparePair(tx, row, patch.machine.sparePair ?? "");
      return tx.vibrationDevice.update({ where: { id: row.id }, data });
    });
    await audit(user.id, "VIBRATION_DEVICE_UPDATE", "VibrationDevice", row.id, `${row.name} (${row.legacyId})`, {
      beforeData: row, afterData: updated, changedFields: Object.keys(patch),
    });
    return ok(await withNames(updated));
  });
}

/** Xoá cứng thiết bị: CHỈ ADMIN và chỉ khi chưa có bản ghi đo (app cũ: deletedDevices chỉ quản trị).
 *  Muốn giữ lịch sử → PATCH active = false. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireVibrationManage();
    requireRole(user, ["ADMIN"]);
    const { id } = await ctx.params;
    const row = await prisma.vibrationDevice.findUnique({ where: { id } });
    if (!row) return fail("Không tìm thấy thiết bị độ rung", 404);
    const records = await prisma.vibrationRecord.count({ where: { deviceId: row.id } });
    if (records > 0) return fail(`Thiết bị có ${records} bản ghi đo nên không xoá được. Hãy chuyển sang "Chỉ lưu lịch sử" để giữ dữ liệu.`, 409);
    await prisma.$transaction(async (tx) => {
      await syncSparePair(tx, row, "");
      await tx.vibrationDevice.delete({ where: { id: row.id } });
    });
    await audit(user.id, "VIBRATION_DEVICE_DELETE", "VibrationDevice", row.id, `${row.name} (${row.legacyId})`, { beforeData: row });
    return ok({ id: row.id });
  });
}
