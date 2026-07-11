import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUser, audit } from "@/lib/api";
import { canManageMaterialCatalog } from "@/lib/constants";
import { isGroupableCategory, runOilGroupingSync } from "@/lib/oil-grouping-sync";

export const dynamic = "force-dynamic";

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function cleanStock(value: unknown) {
  const next = Math.round(Number(value));
  return Number.isFinite(next) && next > 0 ? next : 0;
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!canManageMaterialCatalog(user)) {
      return fail("Chỉ Quản đốc / Phó Quản đốc / Kỹ thuật viên / Quản trị được thêm vật tư ERP", 403);
    }

    const body = await req.json();
    const code = cleanString(body.code);
    const name = cleanString(body.name);
    const unit = cleanString(body.unit);
    const category = cleanString(body.category);
    if (!code || !name || !unit) return fail("Thiếu thông tin bắt buộc");
    if (!isGroupableCategory(category)) return fail("Loại vật tư không thuộc module tồn kho theo nhóm");

    const exists = await prisma.erpMaterial.findUnique({ where: { code }, select: { id: true } });
    if (exists) return fail("Mã vật tư ERP đã tồn tại");

    const material = await prisma.erpMaterial.create({
      data: {
        code,
        name,
        unit,
        category,
        erpStock: cleanStock(body.erpStock),
      },
    });

    await runOilGroupingSync(category).catch(() => null);
    await audit(user.id, "CREATE_GROUPED_ERP_MATERIAL", "ErpMaterial", material.id, material.code);
    return ok(material);
  });
}
