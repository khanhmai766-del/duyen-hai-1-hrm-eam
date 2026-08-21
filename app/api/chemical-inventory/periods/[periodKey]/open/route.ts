import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { CHEMICAL_PERMISSION_ID } from "@/lib/chemical-inventory/constants";
import { parsePeriodKey } from "@/lib/chemical-inventory/validation";
import { formatPeriod } from "@/lib/chemical-inventory/readings";
import { MANAGE_LEVELS } from "@/lib/chemical-inventory/permissions";

export const dynamic = "force-dynamic";

/**
 * POST /api/chemical-inventory/periods/[periodKey]/open
 *
 * Mở kỳ nhập liệu cho một tháng. Phải mở kỳ trước khi ghi bất kỳ số liệu nào —
 * đây là chỗ tách "tháng đang nhập liệu" ra khỏi kiểu sổ Excel gộp nhiều năm vào
 * một bảng dài.
 *
 * Kỳ đã tồn tại thì trả về luôn, không báo lỗi (thao tác vô hại, gọi lại được).
 */
export async function POST(_req: NextRequest, { params }: { params: { periodKey: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...MANAGE_LEVELS], "Không đủ quyền mở kỳ tồn kho");

    const period = parsePeriodKey(params.periodKey);
    if (!period.ok) throw fail(period.error, 400);

    const existing = await prisma.chemicalInventoryPeriod.findUnique({ where: { periodKey: period.value } });
    if (existing) return ok({ periodKey: existing.periodKey, status: existing.status, created: false });

    const created = await prisma.chemicalInventoryPeriod.create({
      data: { periodKey: period.value, status: "DRAFT" },
    });

    await audit(
      user.id,
      "OPEN_CHEMICAL_PERIOD",
      "ChemicalInventoryPeriod",
      created.id,
      auditDetailWithPosition(user, `Mở kỳ ${formatPeriod(period.value)}`)
    );

    return ok({ periodKey: created.periodKey, status: created.status, created: true });
  });
}
