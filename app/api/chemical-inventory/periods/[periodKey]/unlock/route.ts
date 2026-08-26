import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateMaterialAnnualPlanCache } from "@/lib/material-annual-plan-cache";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { CHEMICAL_PERMISSION_ID } from "@/lib/chemical-inventory/constants";
import { parsePeriodKey } from "@/lib/chemical-inventory/validation";
import { formatPeriod } from "@/lib/chemical-inventory/readings";
import { FULL_LEVELS } from "@/lib/chemical-inventory/permissions";

export const dynamic = "force-dynamic";

/**
 * POST /api/chemical-inventory/periods/[periodKey]/unlock
 *
 * Mở khóa một kỳ đã chốt. Cần mức `full` — mở lại sổ đã khóa là thao tác sửa số
 * liệu quyết toán, không nên nằm trong tay mức quản lý thông thường.
 * Bắt buộc ghi lý do để nhật ký audit có ngữ cảnh.
 */
export async function POST(req: NextRequest, { params }: { params: { periodKey: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...FULL_LEVELS], "Không đủ quyền mở khóa sổ tồn kho");

    const period = parsePeriodKey(params.periodKey);
    if (!period.ok) throw fail(period.error, 400);

    const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
    const reason = String(body.reason ?? "").trim();
    if (!reason) throw fail("Phải ghi lý do mở khóa sổ", 400);

    const existing = await prisma.chemicalInventoryPeriod.findUnique({ where: { periodKey: period.value } });
    if (!existing) throw fail(`Kỳ ${formatPeriod(period.value)} chưa được mở`, 404);
    if (existing.status !== "LOCKED") throw fail(`Kỳ ${formatPeriod(period.value)} đang mở, không cần mở khóa`, 409);

    const updated = await prisma.chemicalInventoryPeriod.update({
      where: { id: existing.id },
      data: { status: "DRAFT", lockedAt: null, lockedById: null, note: reason },
    });

    // Trạng thái kỳ quyết định tháng đó vào cột "Luỹ kế đã sử dụng" của biểu QLVT.20
    // là số CHÍNH THỨC hay chỉ tạm tính — xoá đệm để biểu đọc lại ngay.
    invalidateMaterialAnnualPlanCache(Number(period.value.slice(0, 4)));

    await audit(
      user.id,
      "UNLOCK_CHEMICAL_PERIOD",
      "ChemicalInventoryPeriod",
      updated.id,
      auditDetailWithPosition(user, `Mở khóa kỳ ${formatPeriod(period.value)} — lý do: ${reason}`),
      { beforeData: { status: existing.status, lockedAt: existing.lockedAt } }
    );

    return ok({ periodKey: updated.periodKey, status: updated.status });
  });
}
