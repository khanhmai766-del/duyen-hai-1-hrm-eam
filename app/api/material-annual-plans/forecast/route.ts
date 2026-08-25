import type { NextRequest } from "next/server";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { getMaterialAnnualForecast } from "@/lib/material-annual-forecast";

export const dynamic = "force-dynamic";

/** GET /api/material-annual-plans/forecast?year=YYYY — dự toán nhu cầu cho năm đó. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      "material-manage",
      ["read", "personal", "manage", "full"],
      "Không đủ quyền xem dự toán vật tư",
    );
    const year = Number(req.nextUrl.searchParams.get("year") ?? new Date().getFullYear() + 1);
    if (!Number.isInteger(year) || year < 2000 || year > 2200) return fail("Năm dự toán không hợp lệ", 400);
    return ok(await getMaterialAnnualForecast(prisma, year));
  });
}
