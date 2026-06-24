import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { getNormalizedEquipmentNodes } from "@/lib/equipment-tree";

export const dynamic = "force-dynamic";

// Toàn bộ cây danh mục thiết bị (phẳng) — client tự dựng cây từ seq/parentSeq.
export async function GET() {
  return handle(async () => {
    await requireUser();
    const normalizedNodes = await getNormalizedEquipmentNodes(prisma);
    const devices = await prisma.device.findMany({ select: { id: true, code: true } });
    const deviceIdByCode = new Map(devices.map((device) => [device.code, device.id]));
    return ok(normalizedNodes.map((node) => ({ ...node, deviceId: deviceIdByCode.get(node.seq) ?? null })));
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
    const data: Record<string, unknown> = {};
    if (body.attachedInfo !== undefined) data.attachedInfo = body.attachedInfo || null;
    if (body.documentUrl !== undefined) data.documentUrl = body.documentUrl || null;
    if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl || null;
    const node = await prisma.equipmentNode.update({ where: { seq }, data });
    await audit(user.id, "UPDATE_EQUIPMENT_NODE", "EquipmentNode", node.id, node.name);
    return ok({ seq: node.seq });
  });
}
