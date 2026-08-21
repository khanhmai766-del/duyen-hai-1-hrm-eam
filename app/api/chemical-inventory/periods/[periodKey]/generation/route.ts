import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { CHEMICAL_PERMISSION_ID } from "@/lib/chemical-inventory/constants";
import { parsePeriodKey, validateGenerationInput } from "@/lib/chemical-inventory/validation";
import { formatPeriod } from "@/lib/chemical-inventory/readings";
import { toDecimal, toNumber } from "@/lib/chemical-inventory/serialize";
import { MANAGE_LEVELS } from "@/lib/chemical-inventory/permissions";

export const dynamic = "force-dynamic";

/**
 * PUT /api/chemical-inventory/periods/[periodKey]/generation
 * Body: { generationMwh }
 *
 * Sản lượng điện S1+S2 của tháng — mẫu số để tính suất hao đầu cực (kg/MWh).
 * Nhập tay mỗi tháng một lần; hệ thống hiện chưa có nguồn nào cấp sẵn con số này.
 */
export async function PUT(req: NextRequest, { params }: { params: { periodKey: string } }) {
  return handle(async () => {
    const user = await requireUser();
    // Đây là mẫu số dùng chung cho S1+S2, không thuộc riêng cương vị nào nên mức
    // `personal` tuyệt đối không được sửa.
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...MANAGE_LEVELS], "Không đủ quyền nhập sản lượng điện");

    const period = parsePeriodKey(params.periodKey);
    if (!period.ok) throw fail(period.error, 400);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const generation = validateGenerationInput(body);
    if (!generation.ok) throw fail(generation.error, 400);

    const existing = await prisma.chemicalInventoryPeriod.findUnique({ where: { periodKey: period.value } });
    if (!existing) throw fail(`Kỳ ${formatPeriod(period.value)} chưa được mở`, 404);
    if (existing.status === "LOCKED") throw fail(`Kỳ ${formatPeriod(period.value)} đã khóa sổ`, 409);

    const updated = await prisma.chemicalInventoryPeriod.update({
      where: { id: existing.id },
      data: { generationMwh: toDecimal(generation.value) },
    });

    await audit(
      user.id,
      "UPDATE_CHEMICAL_GENERATION",
      "ChemicalInventoryPeriod",
      updated.id,
      auditDetailWithPosition(user, `Sản lượng S1+S2 kỳ ${formatPeriod(period.value)}: ${generation.value ?? "(xóa)"} MWh`)
    );

    return ok({ periodKey: updated.periodKey, generationMwh: toNumber(updated.generationMwh) });
  });
}
