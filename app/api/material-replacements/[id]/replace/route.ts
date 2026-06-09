import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { addMonths } from "@/lib/constants";

/**
 * Ghi nhận một lần thay thế vật tư tại điểm thay thế:
 *  - tạo MaterialReplacementLog (lịch sử),
 *  - cập nhật lastReplacedAt = thời điểm thay,
 *  - dời nextDueAt = thời điểm thay + chu kỳ (tháng),
 *  - (tuỳ chọn) trừ tồn kho vật tư theo số lượng đã dùng.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR", "TECHNICIAN"]);
    const body = await req.json().catch(() => ({}));

    const point = await prisma.materialReplacement.findUnique({
      where: { id: params.id },
      include: { material: { select: { id: true, code: true, quantity: true } } },
    });
    if (!point) return fail("Không tìm thấy điểm thay thế", 404);

    const replacedAt = body.replacedAt ? new Date(body.replacedAt) : new Date();
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
      prisma.materialReplacement.update({
        where: { id: point.id },
        data: { lastReplacedAt: replacedAt, nextDueAt: addMonths(replacedAt, point.intervalMonths) },
        include: {
          material: { select: { id: true, code: true, name: true, unit: true, imageUrl: true } },
          device: { select: { id: true, code: true, name: true, location: true } },
          _count: { select: { logs: true } },
        },
      }),
    ];
    // Trừ tồn kho nếu có nhập số lượng và muốn trừ kho (mặc định có trừ).
    if (useQty && body.deductStock !== false) {
      ops.push(
        prisma.material.update({
          where: { id: point.materialId },
          data: { quantity: { decrement: Math.min(useQty, point.material.quantity) } },
        })
      );
    }

    const result = await prisma.$transaction(ops);
    const updated = result[1];
    await audit(user.id, "RECORD_REPLACEMENT", "MaterialReplacement", point.id, point.material.code);
    return ok(updated);
  });
}
