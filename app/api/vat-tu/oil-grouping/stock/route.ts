// GET /api/vat-tu/oil-grouping/stock
// Tổng tồn kho ERP theo LOẠI DẦU (đã quy đổi về baseUnit) + chi tiết
// từng mã con, cờ cảnh báo dưới ngưỡng minStock.
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import { parseErpCode } from "@/lib/oil-matching";
import { OIL_SCAN_FILTER } from "@/lib/oil-grouping-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    await requireUser();

    const [types, pendingCount] = await Promise.all([
      prisma.oilType.findMany({
        orderBy: { code: "asc" },
        include: {
          materials: {
            where: { mappingStatus: "CONFIRMED" },
            orderBy: { code: "asc" },
            select: {
              id: true,
              code: true,
              name: true,
              unit: true,
              erpStock: true,
              conversionFactor: true,
            },
          },
        },
      }),
      prisma.erpMaterial.count({
        where: { mappingStatus: { in: ["SUGGESTED", "UNMAPPED"] }, ...OIL_SCAN_FILTER },
      }),
    ]);

    const groups = types.map((t) => {
      // Giữ shape erpCode/erpQty cho client (bảng ErpMaterial dùng code/erpStock)
      const materials = t.materials.map(({ code, erpStock, ...m }) => ({
        ...m,
        erpCode: code,
        erpQty: erpStock,
        origin: parseErpCode(code).origin, // "SIN" | "HKG" | ...
        qtyInBase: erpStock * m.conversionFactor,
      }));
      const totalQty = materials.reduce((s, m) => s + m.qtyInBase, 0);
      return {
        id: t.id,
        code: t.code,
        name: t.name,
        baseUnit: t.baseUnit,
        minStock: t.minStock,
        totalQty,
        belowMin: t.minStock != null && totalQty < t.minStock,
        materialCount: materials.length,
        materials,
      };
    });

    return ok({
      groups,
      pendingCount, // badge trên tab "Chờ phân nhóm"
      warningCount: groups.filter((g) => g.belowMin).length,
    });
  });
}
