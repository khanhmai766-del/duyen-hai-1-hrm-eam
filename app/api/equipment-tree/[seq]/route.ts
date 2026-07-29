import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { assertSeqViewable } from "@/lib/server-access";
import { normalizeEquipmentNodeName } from "@/lib/equipment-tree";
import { getProfileOverrides } from "@/lib/equipment-profile-cache";
import { parseScope, scopeCode, scopeKks } from "@/lib/equipment-units";
import { canBypassEquipmentPositionScope } from "@/lib/material-equipment-access";
import { requireDeviceView } from "@/lib/device-permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { seq: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requireDeviceView(user);
    const seq = decodeURIComponent(params.seq ?? "").trim();
    if (!seq) return fail("Thiếu số thứ tự thiết bị");
    // `seq` luôn là mã chuẩn S1; phạm vi chỉ đổi mã hiển thị/KKS và phần ghi đè.
    const scope = parseScope(req.nextUrl.searchParams.get("machine"));

    const canAccessAllNodes = await canBypassEquipmentPositionScope(
      user,
      req.nextUrl.searchParams.get("permissionScope")
    );
    if (!canAccessAllNodes) await assertSeqViewable(user, seq);
    const [node, overrideOf] = await Promise.all([
      prisma.equipmentNode.findUnique({
        where: { seq },
        select: {
          seq: true,
          parentSeq: true,
          name: true,
          kks: true,
          drawing: true,
          depth: true,
          attachedInfo: true,
          documentUrl: true,
          imageUrl: true,
        },
      }),
      getProfileOverrides(scope),
    ]);
    if (!node) return fail("Không tìm thấy thiết bị", 404);
    const override = overrideOf(node.seq);

    return ok({
      ...node,
      machine: scope,
      fullCode: scopeCode(node.seq, scope),
      kks: override?.kks ?? scopeKks(node.kks, scope),
      name: override?.name ?? normalizeEquipmentNodeName(node.seq, node.name),
      deviceId: null,
    });
  });
}
