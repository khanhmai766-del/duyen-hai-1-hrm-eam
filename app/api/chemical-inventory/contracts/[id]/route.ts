import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { CHEMICAL_PERMISSION_ID } from "@/lib/chemical-inventory/constants";
import { validateContractInput } from "@/lib/chemical-inventory/validation";
import { toDecimal } from "@/lib/chemical-inventory/serialize";
import { MANAGE_LEVELS } from "@/lib/chemical-inventory/permissions";

export const dynamic = "force-dynamic";

/** PUT /api/chemical-inventory/contracts/[id] */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...MANAGE_LEVELS], "Không đủ quyền sửa hợp đồng hóa chất");

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = validateContractInput(body);
    if (!input.ok) throw fail(input.error, 400);

    const existing = await prisma.chemicalContract.findUnique({ where: { id: params.id } });
    if (!existing) throw fail("Không tìm thấy hợp đồng", 404);

    const updated = await prisma.chemicalContract.update({
      where: { id: params.id },
      data: {
        year: input.value.year,
        itemId: input.value.itemId,
        materialCode: input.value.materialCode,
        supplier: input.value.supplier,
        origin: input.value.origin,
        contractQuantity: toDecimal(input.value.contractQuantity)!,
        forecastDemand: toDecimal(input.value.forecastDemand)!,
        note: input.value.note,
      },
    });

    await audit(
      user.id,
      "UPDATE_CHEMICAL_CONTRACT",
      "ChemicalContract",
      updated.id,
      auditDetailWithPosition(user, `Hợp đồng năm ${updated.year}: ${updated.contractQuantity}`),
      { beforeData: existing }
    );

    return ok({ id: updated.id });
  });
}

/** DELETE /api/chemical-inventory/contracts/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...MANAGE_LEVELS], "Không đủ quyền xóa hợp đồng hóa chất");

    const existing = await prisma.chemicalContract.findUnique({ where: { id: params.id } });
    if (!existing) throw fail("Không tìm thấy hợp đồng", 404);

    await prisma.chemicalContract.delete({ where: { id: params.id } });

    await audit(
      user.id,
      "DELETE_CHEMICAL_CONTRACT",
      "ChemicalContract",
      params.id,
      auditDetailWithPosition(user, `Xóa hợp đồng năm ${existing.year}`),
      { beforeData: existing }
    );

    return ok({ id: params.id });
  });
}
