import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { canManageMaterialCatalog } from "@/lib/constants";
import { parseErpNumber } from "@/lib/parse-number";

export const dynamic = "force-dynamic";

type StockRow = { code?: unknown; erpStock?: unknown };

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!canManageMaterialCatalog(user)) {
      return fail("Chỉ Quản đốc / Phó Quản đốc / Kỹ thuật viên / Quản trị được cập nhật tồn kho ERP", 403);
    }

    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? (body.rows as StockRow[]) : [];
    if (!rows.length) return fail("File cập nhật chưa có dòng vật tư hợp lệ");

    const existing = await prisma.erpMaterial.findMany({ select: { id: true, code: true, erpStock: true } });
    const existingByCode = new Map(existing.map((item) => [item.code, item]));
    const seen = new Set<string>();
    const updates: Array<{ id: string; code: string; before: number; after: number }> = [];
    const errors: string[] = [];
    let notFound = 0;
    let skipped = 0;

    for (const [index, row] of rows.entries()) {
      const line = index + 1;
      const code = String(row.code ?? "").trim();
      const parsedStock = parseErpNumber(row.erpStock);
      if (!code || !Number.isFinite(parsedStock) || parsedStock < 0) {
        skipped += 1;
        errors.push(`Dòng ${line}: thiếu mã hoặc số liệu ERP không hợp lệ`);
        continue;
      }
      if (seen.has(code)) {
        skipped += 1;
        errors.push(`Dòng ${line}: mã ${code} bị trùng trong file`);
        continue;
      }
      seen.add(code);

      const current = existingByCode.get(code);
      if (!current) {
        notFound += 1;
        continue;
      }
      updates.push({ id: current.id, code, before: current.erpStock, after: Math.round(parsedStock) });
    }

    if (updates.length) {
      await prisma.$transaction(
        updates.map((item) => prisma.erpMaterial.update({ where: { id: item.id }, data: { erpStock: item.after } }))
      );
    }

    const changed = updates.filter((item) => item.before !== item.after).length;
    await audit(
      user.id,
      "UPDATE_ERP_STOCK_FROM_FILE",
      "ErpMaterial",
      undefined,
      `Cập nhật ${updates.length} mã (${changed} mã thay đổi), bỏ qua ${notFound} mã không có trong hệ thống và ${skipped} dòng không hợp lệ`
    );

    return ok({ updated: updates.length, notFound, skipped, errors });
  });
}
