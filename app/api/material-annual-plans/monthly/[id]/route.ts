import type { NextRequest } from "next/server";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { annualPlanNameKey } from "@/lib/material-annual-plan-import";

export const dynamic = "force-dynamic";

/** PUT — sửa cột H, cột J và người đề xuất của một dòng nhu cầu tháng. */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "material-manage", ["manage", "full"], "Không đủ quyền sửa nhu cầu vật tư");
    const current = await prisma.materialMonthlyRequest.findUnique({ where: { id: params.id } });
    if (!current) return fail("Không tìm thấy dòng nhu cầu", 404);

    const body = await req.json().catch(() => ({}));
    const purpose = String(body.purpose ?? current.purpose).trim();
    if (!purpose) return fail("Vui lòng nhập mục đích, vị trí sử dụng");
    const quantity = body.quantity === undefined ? Number(current.quantity) : Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return fail("Số lượng yêu cầu phải lớn hơn 0");
    const materialNameLabel = String(body.materialNameLabel ?? current.materialNameLabel).trim();
    if (!materialNameLabel) return fail("Vui lòng nhập tên vật tư");

    const updated = await prisma.materialMonthlyRequest.update({
      where: { id: params.id },
      data: {
        purpose,
        quantity,
        materialNameLabel,
        materialNameKey: annualPlanNameKey(materialNameLabel),
        unitLabel: String(body.unitLabel ?? current.unitLabel).trim() || current.unitLabel,
        erpCode: body.erpCode === undefined ? current.erpCode : String(body.erpCode ?? "").trim() || null,
        proposerName: body.proposerName === undefined ? current.proposerName : String(body.proposerName ?? "").trim() || null,
        note: body.note === undefined ? current.note : String(body.note ?? "").trim() || null,
      },
    });
    await audit(user.id, "MATERIAL_MONTHLY_REQUEST_UPDATE", "MaterialMonthlyRequest", updated.id,
      auditDetailWithPosition(user, `Sửa nhu cầu ${materialNameLabel} kỳ ${current.periodKey}: ${Number(current.quantity)} → ${quantity}`));
    return ok(updated);
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "material-manage", ["manage", "full"], "Không đủ quyền xoá nhu cầu vật tư");
    const current = await prisma.materialMonthlyRequest.findUnique({ where: { id: params.id } });
    if (!current) return fail("Không tìm thấy dòng nhu cầu", 404);
    await prisma.materialMonthlyRequest.delete({ where: { id: params.id } });
    await audit(user.id, "MATERIAL_MONTHLY_REQUEST_DELETE", "MaterialMonthlyRequest", params.id,
      auditDetailWithPosition(user, `Xoá nhu cầu ${current.materialNameLabel} kỳ ${current.periodKey}`));
    return ok({ id: params.id });
  });
}
