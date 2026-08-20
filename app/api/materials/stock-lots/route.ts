import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { isGasCylinderCategory, materialCategoryMatches } from "@/lib/constants";
import { lotsByCodes, lotLabel } from "@/lib/material-stock-lot";

export const dynamic = "force-dynamic";

/**
 * GET /api/materials/stock-lots?category=&machine=
 * Tồn hiện có TÁCH THEO SỐ PHIẾU GIAO HÀNG — nguồn cho bảng theo dõi ở Danh mục vật tư.
 *
 * Vật tư thường gộp theo mã vì dùng chung kho; riêng Chai khí tách theo mã + tổ máy.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "material-manage", ["read", "personal", "manage", "full"], "Không đủ quyền xem tồn kho vật tư");

    const category = req.nextUrl.searchParams.get("category")?.trim();
    const machine = req.nextUrl.searchParams.get("machine")?.trim();
    const materials = await prisma.material.findMany({
      select: { code: true, name: true, unit: true, category: true, machine: true, quantity: true },
      orderBy: { name: "asc" },
    });

    const byCode = new Map<string, { code: string; name: string; unit: string; category: string | null; machine: string; quantity: number }>();
    for (const m of materials) {
      if (category && !materialCategoryMatches(m.category, category)) continue;
      if (machine && m.machine !== machine) continue;
      const key = isGasCylinderCategory(m.category) ? `${m.code}::${m.machine}` : m.code;
      if (!byCode.has(key)) byCode.set(key, m);
    }

    const lots = await lotsByCodes(prisma, [...new Set([...byCode.values()].map((material) => material.code))]);
    const rows = [...byCode.values()].map((material) => {
      const stockUnit = isGasCylinderCategory(material.category) ? material.machine : "COMMON";
      const list = (lots.get(material.code) ?? []).filter((lot) => lot.stockUnit === stockUnit && lot.quantityLeft > 0);
      return {
        code: material.code,
        name: material.name,
        unit: material.unit,
        category: material.category,
        machine: material.machine,
        // Tổng lô là con số đáng tin; `Material.quantity` gửi kèm để đối chiếu, lệch nhau là
        // dấu hiệu có đường ghi tồn nào đó chưa đi qua sổ lô.
        total: list.reduce((sum, lot) => sum + lot.quantityLeft, 0),
        quantity: material.quantity,
        lots: list.map((lot) => ({
          id: lot.id,
          label: lotLabel(lot),
          deliveryNote: lot.deliveryNote,
          erpCode: lot.erpCode,
          receivedAt: lot.receivedAt,
          quantityIn: lot.quantityIn,
          quantityLeft: lot.quantityLeft,
        })),
      };
    });

    return ok(rows.filter((row) => row.total > 0 || row.quantity > 0));
  });
}
