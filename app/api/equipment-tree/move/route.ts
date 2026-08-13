import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { requireDeviceManage } from "@/lib/device-permissions";
import { assertSeqEditable } from "@/lib/server-access";
import { applyEquipmentMove, planEquipmentMove } from "@/lib/equipment-move";
import { invalidateEquipmentNodeCache } from "@/lib/equipment-node-cache";
import { invalidateDeviceListCache } from "@/lib/device-list-cache";

export const dynamic = "force-dynamic";

/**
 * POST /api/equipment-tree/move — chuyển một nhánh sang thư mục cha khác.
 *
 * Toàn bộ việc đổi mã và kéo dữ liệu đi theo nằm ở `lib/equipment-move.ts` (dùng chung với
 * script sắp xếp lại cây chạy trên máy chủ). Ở đây chỉ còn quyền và ghi nhật ký.
 *
 * `allowScopeChange` mặc định TẮT: chuyển giữa cây tổ máy và cây dùng chung làm đổi hồ sơ tổ
 * máy của mọi phiếu đã gắn, không phải thao tác bấm nhầm là xong.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requireDeviceManage(user, "Bạn không có quyền di chuyển thiết bị");
    const body = await req.json();
    const sourceSeq = String(body.sourceSeq ?? "").trim();
    const targetParentSeq = String(body.targetParentSeq ?? "").trim();
    if (!sourceSeq || !targetParentSeq) return fail("Thiếu thiết bị cần di chuyển hoặc thư mục đích");

    await Promise.all([assertSeqEditable(user, sourceSeq), assertSeqEditable(user, targetParentSeq)]);

    const planned = await planEquipmentMove(prisma, {
      sourceSeq,
      targetParentSeq,
      allowScopeChange: body.allowScopeChange === true,
    });
    if (!planned.ok) return fail(planned.error);
    const plan = planned.plan;

    const result = await prisma.$transaction((tx) => applyEquipmentMove(tx, plan));

    await audit(
      user.id,
      "MOVE_EQUIPMENT_NODE",
      "EquipmentNode",
      undefined,
      `${sourceSeq} → ${result.seq} (${plan.targetName})${plan.toCommon ? ` · chuyển sang cây dùng chung, ${result.rescopedRows} dòng đổi hồ sơ tổ máy` : ""}`
    );
    invalidateEquipmentNodeCache();
    invalidateDeviceListCache();
    return ok({ sourceSeq, seq: result.seq, movedCount: result.movedCount, targetParentSeq });
  });
}
