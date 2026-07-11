import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { canManageMaterialCatalog, MATERIAL_CATEGORIES } from "@/lib/constants";
import { runOilGroupingSync } from "@/lib/oil-grouping-sync";

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

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function cleanStock(value: unknown) {
  const stock = Math.round(Number(value));
  return Number.isFinite(stock) && stock > 0 ? stock : 0;
}

function cleanCategory(value: unknown) {
  const category = cleanString(value);
  const normalized = normalizeText(category);
  if (normalized === "hoa chat" || normalized === "vat tu tieu hao") return "Hóa Chất";
  if (normalized === "bi nghien than" || normalized === "bi nghien") return "Bi Nghiền Than";
  return MATERIAL_CATEGORIES.find((item) => normalizeText(item) === normalized) ?? MATERIAL_CATEGORIES[0];
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

    for (const [index, row] of rows.entries()) {
      const line = index + 1;
      const code = cleanString(row.code);
      const name = cleanString(row.name);
      const unit = cleanString(row.unit);
      const category = cleanCategory(row.category);
      const erpStock = cleanStock(row.erpStock);

      if (!code || !name || !unit) {
        skipped += 1;
        errors.push(`Dòng ${line}: thiếu Mã vật tư, Tên vật tư hoặc ĐVT`);
        continue;
      }
      if (seen.has(code)) {
        skipped += 1;
        errors.push(`Dòng ${line}: mã ${code} bị trùng trong file`);
        continue;
      }
      seen.add(code);

      const current = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "ErpMaterial" WHERE "code" = ${code} LIMIT 1
      `;

      if (current[0]) {
        await prisma.$executeRaw`
          UPDATE "ErpMaterial"
          SET "name" = ${name},
              "unit" = ${unit},
              "category" = ${category},
              "erpStock" = ${erpStock},
              "updatedAt" = NOW()
          WHERE "id" = ${current[0].id}
        `;
        updated += 1;
      } else {
        await prisma.$executeRaw`
          INSERT INTO "ErpMaterial" ("id", "code", "name", "unit", "erpStock", "category", "note", "createdAt", "updatedAt")
          VALUES (${randomUUID()}, ${code}, ${name}, ${unit}, ${erpStock}, ${category}, NULL, NOW(), NOW())
        `;
        created += 1;
      }
    }

    // Quét gợi ý gom nhóm dầu cho các mã mới/chưa duyệt — chỉ đụng UNMAPPED/
    // SUGGESTED nên mapping đã duyệt không bị reset; lỗi không chặn import.
    await runOilGroupingSync().catch(() => null);

    await audit(user.id, "IMPORT_ERP_MATERIAL", "ErpMaterial", undefined, `Tạo mới ${created}, cập nhật ${updated}, bỏ qua ${skipped}`);
    return ok({ created, updated, skipped, errors });
  });
}
