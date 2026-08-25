import type { NextRequest } from "next/server";
import { audit, auditDetailWithPosition, fail, handle, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { getMaterialMonthlyReport, parsePeriodKey } from "@/lib/material-monthly-report";
import { buildMonthlyReportWorkbook, monthlyReportFileName } from "@/lib/material-monthly-export-xlsx";

// exceljs cần Node runtime (không chạy trên Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/material-annual-plans/monthly/export?period=YYYY-MM — biểu QLVT.20 dạng Excel. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      "material-manage",
      ["read", "personal", "manage", "full"],
      "Không đủ quyền xuất biểu nhu cầu vật tư",
    );
    const period = parsePeriodKey(req.nextUrl.searchParams.get("period"));
    if (!period) throw fail("Kỳ không hợp lệ, cần dạng YYYY-MM", 400);

    const report = await getMaterialMonthlyReport(prisma, period);
    const workbook = buildMonthlyReportWorkbook(report);
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = monthlyReportFileName(report);

    await audit(user.id, "MATERIAL_MONTHLY_REPORT_EXPORT", "MaterialMonthlyRequest", period.periodKey,
      auditDetailWithPosition(user, `Xuất biểu QLVT.20 kỳ ${period.periodKey} — ${report.summary.rowCount} dòng`));

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  });
}
