import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  PCCC_PERMISSION,
  pcccBulkViewScope,
  pcccCabinetViewScope,
  resolvePcccViewScope,
  resolvePeriod,
  scopeWhere,
  signaturesOf,
} from "@/lib/pccc-service";
import { buildPcccWorkbook, type ExportSheet } from "@/lib/pccc-export-xlsx";
import { loadSignatureImages } from "@/lib/pccc-archive";

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
    // File Excel phải cắt theo ĐÚNG phạm vi xem của người bấm xuất, nếu không thì cửa
    // trước khoá mà cửa sau vẫn tải được cả bảng của cương vị khác.
    const viewScope = await resolvePcccViewScope(user);
    // Tu chua chay: cuong vi duoc giao tron bang thi xuat het (xem lib/pccc-service.ts).
    const scopeTcc = scopeWhere(sp.get("cuongVi"), sp.get("machine"), pcccCabinetViewScope(viewScope, user));
    // Bang Binh chua chay co cot Nguoi giam sat: cap giam sat xuat duoc phan minh giam sat.
    const scopeBcc = scopeWhere(sp.get("cuongVi"), sp.get("machine"), viewScope, { withSupervisor: true });
    // Foam/CO2/Diesel/FM200 la tai san dung chung -> moi cuong vi deu xuat duoc.
    const scopeFcd = scopeWhere(sp.get("cuongVi"), sp.get("machine"), pcccBulkViewScope(viewScope));

    const [extinguishers, cabinets, bulks, panels, sigBcc, sigTcc, sigBulk] = await Promise.all([
      prisma.pcccExtinguisher.findMany({
        where: { periodId: period.id, ...scopeBcc },
        orderBy: [{ stt: "asc" }, { ma: "asc" }],
      }),
      prisma.pcccCabinet.findMany({
        where: { periodId: period.id, ...scopeTcc },
        orderBy: [{ stt: "asc" }, { ma: "asc" }],
        include: { components: { orderBy: [{ groupOrder: "asc" }, { statusOrder: "asc" }] } },
      }),
      prisma.pcccBulk.findMany({ where: { periodId: period.id, ...scopeFcd }, orderBy: [{ stt: "asc" }, { ten: "asc" }] }),
      prisma.pcccFm200Panel.findMany({ where: { periodId: period.id, ...scopeFcd }, orderBy: { panelKey: "asc" } }),
      signaturesOf(period.id, "EXTINGUISHER"),
      signaturesOf(period.id, "CABINET"),
      signaturesOf(period.id, "BULK"),
    ]);

    // Ảnh chữ ký số của người ký, tải một lần theo key duy nhất (xem lib/pccc-archive.ts).
    const signatureImages = await loadSignatureImages([
      ...[...sigBcc.values()].map((s) => s.signatureKey),
      ...[...sigTcc.values()].map((s) => s.signatureKey),
      ...[...sigBulk.values()].map((s) => s.signatureKey),
    ]);

    const buffer = await buildPcccWorkbook(
      {
        periodLabel: period.label,
        signatureImages,
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
