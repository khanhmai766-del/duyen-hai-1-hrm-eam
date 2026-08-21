import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { CHEMICAL_PERMISSION_ID } from "@/lib/chemical-inventory/constants";
import { listContracts } from "@/lib/chemical-inventory/queries";
import { validateContractInput } from "@/lib/chemical-inventory/validation";
import { toDecimal } from "@/lib/chemical-inventory/serialize";
import { MANAGE_LEVELS, READ_LEVELS } from "@/lib/chemical-inventory/permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/chemical-inventory/contracts?year=2026
 *
 * "Đã nhận" LUÔN được cộng lại từ phiếu nhập, không bao giờ lấy từ cột lưu sẵn —
 * cột "Đã nhận" của sổ Excel trộn lẫn lượng sử dụng từ tháng 9 trở đi.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...READ_LEVELS], "Không đủ quyền xem hợp đồng hóa chất");

    const year = Number(req.nextUrl.searchParams.get("year"));
    if (!Number.isInteger(year) || year < 2020 || year > 2100) throw fail("Năm không hợp lệ", 400);

    return ok(await listContracts(prisma, year));
  });
}

/** POST /api/chemical-inventory/contracts — thêm hoặc ghi đè hợp đồng của một mặt hàng trong năm. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...MANAGE_LEVELS], "Không đủ quyền quản lý hợp đồng hóa chất");

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = validateContractInput(body);
    if (!input.ok) throw fail(input.error, 400);

    const item = await prisma.chemicalInventoryItem.findUnique({ where: { id: input.value.itemId } });
    if (!item) throw fail("Mặt hàng không tồn tại", 404);

    const saved = await prisma.chemicalContract.upsert({
      where: { year_itemId: { year: input.value.year, itemId: input.value.itemId } },
      update: {
        materialCode: input.value.materialCode,
        supplier: input.value.supplier,
        origin: input.value.origin,
        contractQuantity: toDecimal(input.value.contractQuantity)!,
        forecastDemand: toDecimal(input.value.forecastDemand)!,
        note: input.value.note,
      },
      create: {
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
      "UPSERT_CHEMICAL_CONTRACT",
      "ChemicalContract",
      saved.id,
      auditDetailWithPosition(user, `Hợp đồng ${item.name} năm ${input.value.year}: ${input.value.contractQuantity}`)
    );

    return ok({ id: saved.id });
  });
}
