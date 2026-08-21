import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { CHEMICAL_PERMISSION_ID } from "@/lib/chemical-inventory/constants";
import { getAnnualSummary } from "@/lib/chemical-inventory/queries";
import { READ_LEVELS } from "@/lib/chemical-inventory/permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/chemical-inventory/annual?year=2026
 *
 * Ma trận mặt hàng × 12 tháng cho cả "nhập" lẫn "sử dụng".
 * Tháng chưa mở kỳ trả `null` chứ không phải 0 — để giao diện hiện "chưa có dữ liệu"
 * thay vì vẽ một cột 0 trông như đã chốt sổ.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...READ_LEVELS], "Không đủ quyền xem tổng hợp năm");

    const year = Number(req.nextUrl.searchParams.get("year"));
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      throw fail("Năm không hợp lệ", 400);
    }

    return ok(await getAnnualSummary(prisma, year));
  });
}
