import type { NextRequest } from "next/server";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { runMaterialRetention } from "@/lib/material-retention";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { getCachedMaterialAnnualPlanSummary } from "@/lib/material-annual-plan-cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    // Dọn dữ liệu vật tư đã hết hạn lưu. Không có cron trong hệ thống này nên các đợt xoá
    // chạy ké lần đọc, nhiều nhất một lượt mỗi giờ. Cố ý KHÔNG await: dọn dẹp không được
    // làm chậm màn hình của người dùng, và lỗi đã được nuốt sẵn bên trong.
    void runMaterialRetention(prisma);
    await requirePermissionLevel(
      user,
      "material-manage",
      ["read", "personal", "manage", "full"],
      "Không đủ quyền xem kế hoạch vật tư năm",
    );
    const year = Number(req.nextUrl.searchParams.get("year") ?? new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2200) return fail("Năm kế hoạch không hợp lệ", 400);
    return ok(await getCachedMaterialAnnualPlanSummary(prisma, year));
  });
}
