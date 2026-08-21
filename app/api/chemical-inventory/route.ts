import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { CHEMICAL_PERMISSION_ID } from "@/lib/chemical-inventory/constants";
import { getMonthlyGrid, listItems, listPeriods } from "@/lib/chemical-inventory/queries";
import { parsePeriodKey } from "@/lib/chemical-inventory/validation";
import { actingPosition, effectiveLevel, READ_LEVELS } from "@/lib/chemical-inventory/permissions";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/chemical-inventory?month=YYYY-MM&q=&itemType=&position=
 *
 * Lưới tồn kho một tháng: 16 mặt hàng × 7 cương vị, kèm tồn đầu / nhập / sử dụng
 * đã TÍNH LẠI từ dữ liệu gốc. Trả kèm danh mục và danh sách kỳ để giao diện dựng
 * bộ lọc mà không phải gọi thêm.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...READ_LEVELS], "Không đủ quyền xem tồn kho hóa chất");

    const month = parsePeriodKey(req.nextUrl.searchParams.get("month") ?? "");
    if (!month.ok) throw fail(month.error, 400);

    const [grid, items, periods, level] = await Promise.all([
      getMonthlyGrid(prisma, month.value, {
        q: req.nextUrl.searchParams.get("q") ?? undefined,
        itemType: req.nextUrl.searchParams.get("itemType") ?? undefined,
        position: req.nextUrl.searchParams.get("position") ?? undefined,
      }),
      listItems(prisma),
      listPeriods(prisma),
      effectiveLevel(user),
    ]);

    return ok(grid, {
      items,
      // Kỳ mồi không hiện trên bộ chọn tháng: nó chỉ tồn tại để làm tồn đầu.
      periods: periods.filter((p) => !p.isSeed),
      level,
      actingPosition: actingPosition(user),
    });
  });
}
