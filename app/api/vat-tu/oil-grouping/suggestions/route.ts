// GET /api/vat-tu/oil-grouping/suggestions
// Danh sách mã đang chờ phân nhóm (SUGGESTED + UNMAPPED) cho tab duyệt.
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import { OIL_SCAN_FILTER } from "@/lib/oil-grouping-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    await requireUser();

    const [rows, oilTypes] = await Promise.all([
      prisma.erpMaterial.findMany({
        where: { mappingStatus: { in: ["SUGGESTED", "UNMAPPED"] }, ...OIL_SCAN_FILTER },
        orderBy: [{ mappingStatus: "asc" }, { suggestedScore: "desc" }],
        select: {
          id: true,
          code: true,
          name: true,
          unit: true,
          erpStock: true,
          mappingStatus: true,
          suggestedOilTypeId: true,
          suggestedScore: true,
          suggestedReason: true,
        },
      }),
      prisma.oilType.findMany({
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

    return ok({ items, oilTypes });
  });
}
