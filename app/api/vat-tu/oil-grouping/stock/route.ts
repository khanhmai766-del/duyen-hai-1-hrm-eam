// GET /api/vat-tu/oil-grouping/stock?category=<loại vật tư>
// Tổng tồn kho ERP theo NHÓM vật tư của một loại (Dầu bôi trơn / Lõi lọc dầu /
// Hóa Chất / Bi Nghiền Than), đã quy đổi về baseUnit + chi tiết từng mã con,
// cờ cảnh báo dưới ngưỡng minStock.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import { parseErpCode } from "@/lib/oil-matching";
import { isGroupableCategory, pendingCountByCategory, type GroupableCategory } from "@/lib/oil-grouping-sync";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();

    const raw = req.nextUrl.searchParams.get("category");
    const category: GroupableCategory = isGroupableCategory(raw) ? raw : "Dầu bôi trơn";

    const [types, pendingByCategory] = await Promise.all([
      prisma.oilType.findMany({
        where: { category },
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
      pendingCountByCategory(),
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
      category,
      groups,
      pendingCount: pendingByCategory[category], // badge tab "Chờ phân nhóm" của loại đang xem
      pendingByCategory, // badge trên các tab loại vật tư
      warningCount: groups.filter((g) => g.belowMin).length,
    });
  });
}
