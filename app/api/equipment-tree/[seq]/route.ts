import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { assertSeqViewable } from "@/lib/server-access";
import { normalizeEquipmentNodeName } from "@/lib/equipment-tree";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { seq: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const seq = decodeURIComponent(params.seq ?? "").trim();
    if (!seq) return fail("Thiếu số thứ tự thiết bị");

    await assertSeqViewable(user, seq);
    const node = await prisma.equipmentNode.findUnique({
      where: { seq },
      select: {
        seq: true,
        parentSeq: true,
        name: true,
        drawing: true,
        depth: true,
        attachedInfo: true,
        documentUrl: true,
        imageUrl: true,
      },
    });
    if (!node) return fail("Không tìm thấy thiết bị", 404);

    return ok({
      ...node,
      name: normalizeEquipmentNodeName(node.seq, node.name),
      deviceId: null,
    });
  });
}
