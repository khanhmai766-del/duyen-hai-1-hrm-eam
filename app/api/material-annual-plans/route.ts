import type { NextRequest } from "next/server";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { getCachedMaterialAnnualPlanSummary } from "@/lib/material-annual-plan-cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
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
