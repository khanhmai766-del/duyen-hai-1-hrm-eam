import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { getNormalizedEquipmentNodes } from "@/lib/equipment-tree";
import { assertSeqEditable, filterEquipmentNodesForUser } from "@/lib/server-access";
import { maybeUploadDataUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";

// Toàn bộ cây danh mục thiết bị (phẳng) — client tự dựng cây từ seq/parentSeq.
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const normalizedNodes = await getNormalizedEquipmentNodes(prisma);
    const visibleNodes = await filterEquipmentNodesForUser(user, normalizedNodes);
    return ok(visibleNodes.map((node) => ({ ...node, deviceId: node.deviceId ?? null })));
  });
}

// Cập nhật thông tin/tài liệu/ảnh người dùng bổ sung cho một node (theo seq).
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR", "TECHNICIAN"]);
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
    return ok({ seq: node.seq });
  });
}
