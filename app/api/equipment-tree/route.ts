import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { assertSeqEditable, filterEquipmentNodesForUser } from "@/lib/server-access";
import { getCachedEquipmentNodeList, invalidateEquipmentNodeCache } from "@/lib/equipment-node-cache";
import { maybeUploadDataUrl } from "@/lib/s3";
import { invalidateDeviceListCache } from "@/lib/device-list-cache";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const dynamic = "force-dynamic";

// Toàn bộ cây danh mục thiết bị (phẳng) — client tự dựng cây từ seq/parentSeq.
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const normalizedNodes = await getCachedEquipmentNodeList();
    const visibleNodes = await filterEquipmentNodesForUser(user, normalizedNodes);
    return ok(visibleNodes.map((node) => ({
      seq: node.seq,
      parentSeq: node.parentSeq,
      name: node.name,
      drawing: node.drawing,
      depth: node.depth,
      deviceId: node.deviceId ?? null,
    })));
  });
}

// Cập nhật thông tin/tài liệu/ảnh người dùng bổ sung cho một node (theo seq).
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "device-manage", ["manage", "full"], "Không đủ quyền cập nhật cây thiết bị");
    const body = await req.json();
    const seq = String(body.seq ?? "").trim();
    if (!seq) return fail("Thiếu số thứ tự");
    await assertSeqEditable(user, seq);
    const data: Record<string, unknown> = {};
    if (body.attachedInfo !== undefined) data.attachedInfo = body.attachedInfo || null;
    if (body.documentUrl !== undefined) data.documentUrl = body.documentUrl || null;
    if (body.imageUrl !== undefined) {
      data.imageUrl = await maybeUploadDataUrl({ value: body.imageUrl || null, folder: "equipment/images", preset: "image" });
    }
    const node = await prisma.equipmentNode.update({ where: { seq }, data });
    await audit(user.id, "UPDATE_EQUIPMENT_NODE", "EquipmentNode", node.id, node.name);
    invalidateEquipmentNodeCache();
    invalidateDeviceListCache();
    return ok({ seq: node.seq });
  });
}
