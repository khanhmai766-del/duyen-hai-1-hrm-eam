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

    // "Hiện có" là tồn kho vận hành thực tế (Material.quantity), được dẫn xuất
    // theo các mã ERP đã gom. Không dùng số nhập tay OilType.onHandQty.
    const allErpCodes = [...new Set(types.flatMap((type) => type.materials.map((material) => material.code)))];
    const catalogRows = allErpCodes.length
      ? await prisma.$queryRaw<Array<{ id: string; code: string; erpCodes: string[]; quantity: number }>>`
          SELECT "id", "code", "erpCodes", "quantity" FROM "Material"
          WHERE "code" = ANY(${allErpCodes}::text[]) OR "erpCodes" && ${allErpCodes}::text[]
        `
      : [];

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
        // S1/S2/COMMON là ba nơi khai báo cùng một kho dùng chung, không phải
        // ba lượng tồn độc lập. Các dòng liên kết cùng nhóm phải có quantity
        // đồng bộ; chỉ lấy một giá trị (không cộng thành 3 lần).
        onHandQty: Math.max(
          0,
          ...catalogRows
            .filter((row) => {
              const codes = new Set(t.materials.map((material) => material.code));
              return codes.has(row.code) || (row.erpCodes ?? []).some((code) => codes.has(code));
            })
            .map((row) => Number(row.quantity || 0))
        ),
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
