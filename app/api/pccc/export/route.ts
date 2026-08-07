import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { PCCC_PERMISSION, resolvePeriod, scopeWhere, signaturesOf } from "@/lib/pccc-service";
import { buildPcccWorkbook, type ExportSheet } from "@/lib/pccc-export-xlsx";

// exceljs cần Node runtime (không chạy trên Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALL_SHEETS: ExportSheet[] = ["BCC", "TCC", "FCD"];

// GET /api/pccc/export?period=T08.2026&sheets=BCC,TCC,FCD&cuongVi=TBTH
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.view, ["read", "personal", "manage", "full"]);

    const sp = req.nextUrl.searchParams;
    const period = await resolvePeriod(sp.get("period"));
    const requested = (sp.get("sheets") ?? "").split(",").map((s) => s.trim().toUpperCase());
    const sheets = ALL_SHEETS.filter((s) => requested.includes(s));
    const scope = scopeWhere(sp.get("cuongVi"), sp.get("machine"));

    const [extinguishers, cabinets, bulks, panels, sigBcc, sigTcc, sigBulk] = await Promise.all([
      prisma.pcccExtinguisher.findMany({
        where: { periodId: period.id, ...scope },
        orderBy: [{ stt: "asc" }, { ma: "asc" }],
      }),
      prisma.pcccCabinet.findMany({
        where: { periodId: period.id, ...scope },
        orderBy: [{ stt: "asc" }, { ma: "asc" }],
        include: { components: { orderBy: [{ groupOrder: "asc" }, { statusOrder: "asc" }] } },
      }),
      prisma.pcccBulk.findMany({ where: { periodId: period.id, ...scope }, orderBy: [{ stt: "asc" }, { ten: "asc" }] }),
      prisma.pcccFm200Panel.findMany({ where: { periodId: period.id }, orderBy: { panelKey: "asc" } }),
      signaturesOf(period.id, "EXTINGUISHER"),
      signaturesOf(period.id, "CABINET"),
      signaturesOf(period.id, "BULK"),
    ]);

    const buffer = await buildPcccWorkbook(
      {
        periodLabel: period.label,
        extinguishers: extinguishers.map((r) => ({ ...r, signature: sigBcc.get(r.id) ?? null })),
        cabinets: cabinets.map((r) => ({ ...r, signature: sigTcc.get(r.id) ?? null })),
        bulks: bulks.map((r) => ({ ...r, signature: sigBulk.get(r.id) ?? null })),
        panels: panels.map((p) => ({
          ...p,
          mucValues: (p.mucValues ?? {}) as Record<string, number | null>,
          apValues: (p.apValues ?? {}) as Record<string, number | null>,
        })),
      },
      sheets.length > 0 ? sheets : ALL_SHEETS
    );

    await audit(
      user.id,
      "EXPORT_PCCC",
      "PcccPeriod",
      period.id,
      auditDetailWithPosition(user, `Xuất Excel ${period.label} (${(sheets.length ? sheets : ALL_SHEETS).join(", ")})`)
    );

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="PCCC-${period.label}.xlsx"`,
      },
    });
  });
}
