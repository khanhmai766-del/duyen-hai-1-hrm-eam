import type { NextRequest } from "next/server";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { buildAnnualPlanImportPreview, resolveAnnualPlanRows } from "@/lib/material-annual-plan-import";
import { prisma } from "@/lib/prisma";
import { invalidateMaterialAnnualPlanCache } from "@/lib/material-annual-plan-cache";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { readAnnualPlanWorkbook } from "../shared";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseResolutions(value: FormDataEntryValue | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value)) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).map(([key, quantity]) => [key, Number(quantity)]));
  } catch {
    throw fail("Danh sách giá trị xử lý mâu thuẫn không hợp lệ", 400);
  }
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "material-manage", ["manage", "full"], "Không đủ quyền ghi kế hoạch vật tư");
    const { buffer, fileName, sheetName, form } = await readAnnualPlanWorkbook(req);
    const preview = await buildAnnualPlanImportPreview(prisma, buffer, fileName, sheetName);
    const expectedHash = String(form.get("expectedHash") ?? "").trim();
    if (!expectedHash || expectedHash !== preview.fileHash) {
      return fail("Tệp đã thay đổi so với lần đối chiếu — hãy xem trước lại rồi ghi", 409);
    }
    const errors = preview.issues.filter((issue) => issue.severity === "error");
    if (errors.length) return fail(`Còn ${errors.length} lỗi phải xử lý trước khi ghi`, 422);

    let rows;
    try {
      rows = resolveAnnualPlanRows(preview, parseResolutions(form.get("resolutions")));
    } catch (error) {
      return fail((error as Error).message, 422);
    }
    if (rows.length === 0) return fail("Sheet không có dòng kế hoạch hợp lệ để ghi", 422);
    const existing = await prisma.materialAnnualPlan.findMany({
      where: {
        year: preview.detectedYear,
        OR: rows.map((row) => ({ materialCategory: row.materialCategory, materialNameKey: row.materialNameKey })),
      },
      select: { materialCategory: true, materialNameKey: true },
    });
    const existingKeys = new Set(existing.map((row) => `${row.materialCategory}|${row.materialNameKey}`));

    await prisma.$transaction(rows.map((row) => prisma.materialAnnualPlan.upsert({
      where: {
        year_materialCategory_materialNameKey: {
          year: preview.detectedYear,
          materialCategory: row.materialCategory,
          materialNameKey: row.materialNameKey,
        },
      },
      create: {
        year: preview.detectedYear,
        materialCategory: row.materialCategory,
        materialNameKey: row.materialNameKey,
        materialNameLabel: row.materialNameLabel,
        erpCode: row.erpCode,
        materialId: row.materialId,
        unitLabel: row.unitLabel,
        plannedQuantity: row.plannedQuantity,
        note: `Nhập từ QLVT.20 · ${fileName} · ${preview.selectedSheet} · dòng ${row.sourceRow}`,
      },
      update: {
        materialNameLabel: row.materialNameLabel,
        erpCode: row.erpCode,
        materialId: row.materialId,
        unitLabel: row.unitLabel,
        plannedQuantity: row.plannedQuantity,
        note: `Nhập từ QLVT.20 · ${fileName} · ${preview.selectedSheet} · dòng ${row.sourceRow}`,
      },
    })));

    // Chỉ tiêu năm vừa đổi — cột E và cột G của biểu phải đọc lại ngay.
    invalidateMaterialAnnualPlanCache(preview.detectedYear);

    const created = rows.filter((row) => !existingKeys.has(`${row.materialCategory}|${row.materialNameKey}`)).length;
    const updated = rows.length - created;
    await audit(
      user.id,
      "IMPORT_MATERIAL_ANNUAL_PLAN",
      "MaterialAnnualPlan",
      String(preview.detectedYear),
      auditDetailWithPosition(
        user,
        `${fileName} · ${preview.selectedSheet}: ${created} dòng mới, ${updated} dòng cập nhật, ${preview.conflicts.length} mâu thuẫn đã chốt`,
      ),
    );
    return ok({
      year: preview.detectedYear,
      created,
      updated,
      total: rows.length,
      selectedSheet: preview.selectedSheet,
    });
  });
}
