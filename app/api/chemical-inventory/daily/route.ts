import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { CHEMICAL_PERMISSION_ID } from "@/lib/chemical-inventory/constants";
import { getDailyLog } from "@/lib/chemical-inventory/queries";
import { parsePeriodKey } from "@/lib/chemical-inventory/validation";
import { effectiveLevel, READ_LEVELS } from "@/lib/chemical-inventory/permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/chemical-inventory/daily?month=YYYY-MM&itemId=...
 *
 * Nhật ký ngày của một mặt hàng theo dõi hằng ngày (hiện chỉ NH3).
 * Tồn 00h của mỗi ngày KHÔNG lưu trong DB — nó là tồn 24h ngày trước, suy ra khi đọc.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...READ_LEVELS], "Không đủ quyền xem nhật ký hóa chất");

    const month = parsePeriodKey(req.nextUrl.searchParams.get("month") ?? "");
    if (!month.ok) throw fail(month.error, 400);

    const itemId = req.nextUrl.searchParams.get("itemId")?.trim();
    if (!itemId) throw fail("Thiếu mặt hàng", 400);

    const log = await getDailyLog(prisma, month.value, itemId);
    if (!log) throw fail("Mặt hàng không tồn tại", 404);

    return ok(log, { level: await effectiveLevel(user) });
  });
}
