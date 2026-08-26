import type { NextRequest } from "next/server";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { runMaterialRetention } from "@/lib/material-retention";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { annualPlanNameKey, ANNUAL_PLAN_GROUPS } from "@/lib/material-annual-plan-import";
import { getMaterialMonthlyReport, parsePeriodKey } from "@/lib/material-monthly-report";

export const dynamic = "force-dynamic";

const GROUPS = Object.values(ANNUAL_PLAN_GROUPS) as string[];

/** GET /api/material-annual-plans/monthly?period=YYYY-MM — biểu QLVT.20 của một tháng. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    // Dọn dữ liệu vật tư đã hết hạn lưu. Không có cron trong hệ thống này nên các đợt xoá
    // chạy ké lần đọc, nhiều nhất một lượt mỗi giờ. Cố ý KHÔNG await: dọn dẹp không được
    // làm chậm màn hình của người dùng, và lỗi đã được nuốt sẵn bên trong.
    void runMaterialRetention(prisma);
    await requirePermissionLevel(
      user,
      "material-manage",
      ["read", "personal", "manage", "full"],
      "Không đủ quyền xem biểu nhu cầu vật tư",
    );
    const period = parsePeriodKey(req.nextUrl.searchParams.get("period"));
    if (!period) return fail("Kỳ không hợp lệ, cần dạng YYYY-MM", 400);
    return ok(await getMaterialMonthlyReport(prisma, period));
  });
}

/**
 * POST — thêm một dòng nhu cầu tháng (cột H và J).
 *
 * Chỉ nhận đúng hai cột này cộng phần định danh vật tư; mọi số liệu khác của biểu đều do hệ
 * thống tính, nhận từ client là mở đường cho số liệu trôi trở lại.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "material-manage", ["manage", "full"], "Không đủ quyền khai nhu cầu vật tư");

    const body = await req.json().catch(() => ({}));
    const period = parsePeriodKey(body.periodKey);
    if (!period) return fail("Kỳ không hợp lệ, cần dạng YYYY-MM", 400);

    const materialCategory = String(body.materialCategory ?? "").trim();
    if (!GROUPS.includes(materialCategory)) return fail("Nhóm vật tư không hợp lệ");

    const materialNameLabel = String(body.materialNameLabel ?? "").trim();
    if (!materialNameLabel) return fail("Vui lòng nhập tên vật tư");

    const purpose = String(body.purpose ?? "").trim();
    if (!purpose) return fail("Vui lòng nhập mục đích, vị trí sử dụng");

    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return fail("Số lượng yêu cầu phải lớn hơn 0");

    const unitLabel = String(body.unitLabel ?? "").trim();
    if (!unitLabel) return fail("Vui lòng nhập đơn vị tính");

    const created = await prisma.materialMonthlyRequest.create({
      data: {
        periodKey: period.periodKey,
        materialCategory,
        materialNameKey: annualPlanNameKey(materialNameLabel),
        materialNameLabel,
        erpCode: String(body.erpCode ?? "").trim() || null,
        unitLabel,
        purpose,
        quantity,
        proposerName: String(body.proposerName ?? "").trim() || user.name || null,
        note: String(body.note ?? "").trim() || null,
        createdById: user.id,
        createdByName: user.name ?? "",
      },
    });
    await audit(user.id, "MATERIAL_MONTHLY_REQUEST_CREATE", "MaterialMonthlyRequest", created.id,
      auditDetailWithPosition(user, `Khai nhu cầu ${materialNameLabel} ${quantity} ${unitLabel} kỳ ${period.periodKey}`));
    return ok(created);
  });
}
