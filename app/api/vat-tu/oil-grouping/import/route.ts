import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { canManageMaterialCatalog } from "@/lib/constants";
import { isGroupableCategory, runOilGroupingSync, type GroupableCategory } from "@/lib/oil-grouping-sync";

export const dynamic = "force-dynamic";

type ImportRow = {
  code?: unknown;
  name?: unknown;
  unit?: unknown;
  category?: unknown;
  erpStock?: unknown;
};

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function cleanStock(value: unknown) {
  const stock = Math.round(Number(value));
  return Number.isFinite(stock) && stock > 0 ? stock : 0;
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!canManageMaterialCatalog(user)) {
      return fail("Chỉ Quản đốc / Phó Quản đốc / Kỹ thuật viên / Quản trị được nhập vật tư ERP", 403);
    }

    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? (body.rows as ImportRow[]) : [];
    if (!rows.length) return fail("File import chưa có dòng vật tư hợp lệ");

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const seen = new Set<string>();
    const touchedCategories = new Set<GroupableCategory>();

    for (const [index, row] of rows.entries()) {
      const line = index + 1;
      const code = cleanString(row.code);
      const name = cleanString(row.name);
      const unit = cleanString(row.unit);
      const category = cleanString(row.category);
      const erpStock = cleanStock(row.erpStock);

      if (!code || !name || !unit) {
        skipped += 1;
        errors.push(`Dòng ${line}: thiếu Mã vật tư, Tên vật tư hoặc ĐVT`);
        continue;
      }
      if (!isGroupableCategory(category)) {
        skipped += 1;
        errors.push(`Dòng ${line}: loại vật tư không thuộc module tồn kho theo nhóm`);
        continue;
      }
      if (seen.has(code)) {
        skipped += 1;
        errors.push(`Dòng ${line}: mã ${code} bị trùng trong file`);
        continue;
      }
      seen.add(code);
      touchedCategories.add(category);

      const current = await prisma.erpMaterial.findUnique({ where: { code }, select: { id: true } });
      if (current) {
        await prisma.erpMaterial.update({
          where: { id: current.id },
          data: { name, unit, category, erpStock },
        });
        updated += 1;
      } else {
        await prisma.erpMaterial.create({
          data: { code, name, unit, category, erpStock },
        });
        created += 1;
      }
    }

    for (const category of touchedCategories) {
      await runOilGroupingSync(category).catch(() => null);
    }

    await audit(user.id, "IMPORT_GROUPED_ERP_MATERIAL", "ErpMaterial", undefined, `Tạo mới ${created}, cập nhật ${updated}, bỏ qua ${skipped}`);
    return ok({ created, updated, skipped, errors });
  });
}
