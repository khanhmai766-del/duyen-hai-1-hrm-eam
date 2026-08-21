import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { CHEMICAL_PERMISSION_ID } from "@/lib/chemical-inventory/constants";
import { deleteReceipt, updateReceipt } from "@/lib/chemical-inventory/receipts";
import { validateReceiptInput } from "@/lib/chemical-inventory/validation";
import { assertPositionScope, effectiveLevel, MANAGE_LEVELS, WRITE_LEVELS } from "@/lib/chemical-inventory/permissions";

export const dynamic = "force-dynamic";

/** PUT /api/chemical-inventory/receipts/[id] — sửa một chuyến xe. */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...WRITE_LEVELS], "Không đủ quyền sửa phiếu nhập hóa chất");

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = validateReceiptInput(body);
    if (!input.ok) throw fail(input.error, 400);

    // Mức cá nhân phải được phép trên CẢ phiếu hiện tại lẫn cương vị đích. Nếu chỉ
    // kiểm payload, người dùng có thể lấy id phiếu nơi khác rồi đổi nó về cương vị mình.
    const existing = await prisma.chemicalReceipt.findUnique({
      where: { id: params.id },
      select: { receivingPosition: true },
    });
    if (!existing) throw fail("Không tìm thấy phiếu nhập", 404);
    const level = await effectiveLevel(user);
    const scopedLevel = level === "read" || level === "none" ? "personal" : level;
    assertPositionScope(user, existing.receivingPosition ?? "", scopedLevel);
    assertPositionScope(user, input.value.receivingPosition ?? "", scopedLevel);

    const updated = await prisma.$transaction((tx) => updateReceipt(tx, params.id, input.value, user.id));

    await audit(
      user.id,
      "UPDATE_CHEMICAL_RECEIPT",
      "ChemicalReceipt",
      params.id,
      auditDetailWithPosition(user, `Ngày ${updated.receivedAt.toISOString().slice(0, 10)}, khối lượng ${updated.acceptedWeight}`)
    );

    return ok({ id: updated.id });
  });
}

/**
 * DELETE /api/chemical-inventory/receipts/[id]
 * Cần mức `manage`. Phiếu sinh từ phiếu vật tư thì bị chặn — phải hủy phiếu gốc.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...MANAGE_LEVELS], "Không đủ quyền xóa phiếu nhập hóa chất");

    const removed = await prisma.$transaction((tx) => deleteReceipt(tx, params.id));

    await audit(
      user.id,
      "DELETE_CHEMICAL_RECEIPT",
      "ChemicalReceipt",
      params.id,
      auditDetailWithPosition(
        user,
        `Ngày ${removed.receivedAt.toISOString().slice(0, 10)}, biển số ${removed.vehicleNumber ?? "(không có)"}, khối lượng ${removed.acceptedWeight}`
      ),
      { beforeData: removed }
    );

    return ok({ id: params.id });
  });
}
