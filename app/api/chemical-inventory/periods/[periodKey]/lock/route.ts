import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateMaterialAnnualPlanCache } from "@/lib/material-annual-plan-cache";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { CHEMICAL_PERMISSION_ID } from "@/lib/chemical-inventory/constants";
import { parsePeriodKey } from "@/lib/chemical-inventory/validation";
import { formatPeriod } from "@/lib/chemical-inventory/readings";
import { MANAGE_LEVELS } from "@/lib/chemical-inventory/permissions";

export const dynamic = "force-dynamic";

/**
 * POST /api/chemical-inventory/periods/[periodKey]/lock
 *
 * Khóa sổ một tháng: sau đó không thêm/sửa/xóa được phiếu nhập lẫn bản đọc tồn của
 * kỳ đó.
 *
 * CỐ Ý KHÔNG áp ràng buộc "tháng trước phải khóa xong" — người dùng muốn chạy thực
 * tế xem quy trình thật diễn ra thế nào rồi mới quyết. Cột `status` đã sẵn sàng để
 * bật quy tắc đó sau mà không phải migrate.
 */
export async function POST(req: NextRequest, { params }: { params: { periodKey: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...MANAGE_LEVELS], "Không đủ quyền khóa sổ tồn kho");

    const period = parsePeriodKey(params.periodKey);
    if (!period.ok) throw fail(period.error, 400);

    const existing = await prisma.chemicalInventoryPeriod.findUnique({ where: { periodKey: period.value } });
    if (!existing) throw fail(`Kỳ ${formatPeriod(period.value)} chưa được mở`, 404);
    if (existing.status === "LOCKED") throw fail(`Kỳ ${formatPeriod(period.value)} đã khóa từ trước`, 409);

    const body = (await req.json().catch(() => ({}))) as { note?: unknown };
    const updated = await prisma.chemicalInventoryPeriod.update({
      where: { id: existing.id },
      data: {
        status: "LOCKED",
        lockedAt: new Date(),
        lockedById: user.id,
        note: String(body.note ?? "").trim() || existing.note,
      },
    });

    // Trạng thái kỳ quyết định tháng đó vào cột "Luỹ kế đã sử dụng" của biểu QLVT.20
    // là số CHÍNH THỨC hay chỉ tạm tính — xoá đệm để biểu đọc lại ngay.
    invalidateMaterialAnnualPlanCache(Number(period.value.slice(0, 4)));

    await audit(
      user.id,
      "LOCK_CHEMICAL_PERIOD",
      "ChemicalInventoryPeriod",
      updated.id,
      auditDetailWithPosition(user, `Khóa sổ kỳ ${formatPeriod(period.value)}`)
    );

    return ok({ periodKey: updated.periodKey, status: updated.status, lockedAt: updated.lockedAt?.toISOString() ?? null });
  });
}
