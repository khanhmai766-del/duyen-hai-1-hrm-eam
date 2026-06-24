import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
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
