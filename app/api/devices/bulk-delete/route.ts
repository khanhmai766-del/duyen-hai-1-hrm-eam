import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { invalidateEquipmentNodeCache } from "@/lib/equipment-node-cache";
import { invalidateDeviceListCache } from "@/lib/device-list-cache";

export const dynamic = "force-dynamic";

const MAX_BULK_DELETE = 500;

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "device-delete", ["full"], "Không đủ quyền xoá thiết bị");

    const body = await req.json().catch(() => null) as { ids?: unknown } | null;
    if (!Array.isArray(body?.ids)) return fail("Danh sách thiết bị không hợp lệ");

    const ids = [...new Set(body.ids.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return fail("Chưa chọn thiết bị cần xóa");
    if (ids.length > MAX_BULK_DELETE) return fail(`Chỉ được xóa tối đa ${MAX_BULK_DELETE} thiết bị mỗi lần`);
    if (ids.some((id) => !/^\d+(?:\.\d+)*$/.test(id))) return fail("Danh sách có số thứ tự thiết bị không hợp lệ");

    const [nodes, parents] = await Promise.all([
      prisma.equipmentNode.findMany({ where: { seq: { in: ids } }, select: { seq: true, name: true } }),
      prisma.equipmentNode.findMany({ where: { parentSeq: { in: ids } }, select: { parentSeq: true }, distinct: ["parentSeq"] }),
    ]);
    if (nodes.length !== ids.length) return fail("Một số thiết bị không còn tồn tại. Vui lòng tải lại cây thiết bị", 409);

    const parentSeqs = parents.map((node) => node.parentSeq).filter((seq): seq is string => !!seq);
    if (parentSeqs.length > 0) {
      return fail(`Không thể xóa thư mục/hệ thống đang có thiết bị con: ${parentSeqs.slice(0, 5).join(", ")}`, 400);
    }

    const result = await prisma.$transaction((tx) => tx.equipmentNode.deleteMany({ where: { seq: { in: ids } } }));
    await audit(user.id, "BULK_DELETE_EQUIPMENT_NODE", "EquipmentNode", ids.join(","), `Xóa hàng loạt ${result.count} thiết bị`);
    invalidateEquipmentNodeCache();
    invalidateDeviceListCache();
    return ok({ ids, count: result.count });
  });
}
