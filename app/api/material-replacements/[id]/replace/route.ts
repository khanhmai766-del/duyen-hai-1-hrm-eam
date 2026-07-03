import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { parseDateInput } from "@/lib/utils";

/**
 * Ghi nhận một lần thay thế vật tư tại điểm thay thế (chỉ ADMIN/Trưởng ca):
 *  - tạo MaterialReplacementLog (lưu vào "Lịch thay thế vật tư" → tab Lịch sử),
 *  - GỠ điểm khỏi danh sách theo dõi (isActive = false) → hết cảnh báo đến hạn,
 *  - (tuỳ chọn) trừ tồn kho vật tư theo số lượng đã dùng.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "replacement-manage", ["manage", "full"], "Không đủ quyền ghi nhận thay thế vật tư");
    const body = await req.json().catch(() => ({}));

    const point = await prisma.materialReplacement.findUnique({
      where: { id: params.id },
      include: { material: { select: { id: true, code: true, quantity: true } } },
    });
    if (!point) return fail("Không tìm thấy điểm thay thế", 404);
    const access = await resolveEquipmentAccessForUser(user);
    if (
      access.hasExplicitScopes &&
      !access.canEditDeviceLike({ device: point.deviceSeq, system: point.system })
    ) {
      return fail("Cương vị của bạn không có quyền thao tác trên điểm thay thế này", 403);
    }

    const replacedAt = body.replacedAt ? parseDateInput(body.replacedAt) : new Date();
    const qty = body.quantity != null && body.quantity !== "" ? Number(body.quantity) : null;
    const useQty = Number.isFinite(qty as number) && (qty as number) > 0 ? (qty as number) : null;

    const ops: any[] = [
      prisma.materialReplacementLog.create({
        data: {
          replacementId: point.id,
          doneById: user.id,
          replacedAt,
          quantity: useQty,
          note: body.note?.trim() || null,
        },
      }),
      // Gỡ điểm khỏi danh sách theo dõi (giữ lại để truy vết lịch sử).
      prisma.materialReplacement.update({
        where: { id: point.id },
        data: { isActive: false, lastReplacedAt: replacedAt },
      }),
    ];
    // Trừ tồn kho nếu có nhập số lượng (mặc định có trừ).
    if (useQty && body.deductStock !== false) {
      ops.push(
        prisma.material.update({
          where: { id: point.materialId },
          data: { quantity: { decrement: Math.min(useQty, point.material.quantity) } },
        })
      );
    }

    await prisma.$transaction(ops);
    await audit(user.id, "RECORD_REPLACEMENT", "MaterialReplacement", point.id, point.material.code);
    return ok({ id: point.id, archived: true });
  });
}
