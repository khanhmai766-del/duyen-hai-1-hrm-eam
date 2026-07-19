// GET /api/vat-tu/oil-grouping/suggestions?category=<loại vật tư>
// Danh sách mã đang chờ phân nhóm (SUGGESTED + UNMAPPED) của một loại vật tư
// cho tab duyệt, kèm danh sách nhóm cùng loại để chọn.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import { categoryScanFilter, isGroupableCategory, type GroupableCategory } from "@/lib/oil-grouping-sync";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();

    const raw = req.nextUrl.searchParams.get("category");
    const category: GroupableCategory = isGroupableCategory(raw) ? raw : "Dầu bôi trơn";

    const [rows, oilTypes] = await Promise.all([
      prisma.erpMaterial.findMany({
        where: { mappingStatus: { in: ["SUGGESTED", "UNMAPPED"] }, ...categoryScanFilter(category) },
        orderBy: [{ mappingStatus: "asc" }, { suggestedScore: "desc" }],
        select: {
          id: true,
          code: true,
          name: true,
          unit: true,
          warehouse: true,
          erpStock: true,
          mappingStatus: true,
          suggestedOilTypeId: true,
          suggestedScore: true,
          suggestedReason: true,
        },
      }),
      prisma.oilType.findMany({
        where: { category },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true, baseUnit: true },
      }),
    ]);

    // Giữ shape erpCode/erpQty cho client (bảng ErpMaterial dùng code/erpStock)
    const items = rows.map(({ code, erpStock, ...rest }) => ({
      ...rest,
      erpCode: code,
      erpQty: erpStock,
    }));

    return ok({ category, items, oilTypes });
  });
}
