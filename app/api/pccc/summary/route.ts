import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  PCCC_PERMISSION,
  cuongViListOf,
  pcccViewScopeMeta,
  resolvePcccViewScope,
  resolvePeriod,
  scopeWhere,
} from "@/lib/pccc-service";
import {
  periodEndDate,
  summarizeBulks,
  summarizeCabinets,
  summarizeExtinguishers,
  summarizeFm200,
} from "@/lib/pccc-summary";

export const dynamic = "force-dynamic";

// GET /api/pccc/summary?period=T08.2026&cuongVi=TBTH -> số liệu bảng TỔNG QUAN
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.view, ["read", "personal", "manage", "full"]);

    const sp = req.nextUrl.searchParams;
    const period = await resolvePeriod(sp.get("period"));
    const cuongVi = sp.get("cuongVi");
    const machine = sp.get("machine");
    // Số liệu tổng quan phải đếm ĐÚNG phần người dùng được xem, nếu không con số ở tab
    // Tổng quan lại tố ra khối lượng của cương vị mà bảng chi tiết đã giấu đi.
    const viewScope = await resolvePcccViewScope(user);
    const scope = scopeWhere(cuongVi, machine, viewScope);
    // Bang Binh chua chay co cot Nguoi giam sat -> cap giam sat xem duoc phan minh giam sat.
    const scopeBcc = scopeWhere(cuongVi, machine, viewScope, { withSupervisor: true });

    const [extinguishers, cabinets, bulks, panels, cuongViList, signatureCount] = await Promise.all([
      prisma.pcccExtinguisher.findMany({
        where: { periodId: period.id, ...scopeBcc },
        select: { chungLoai: true, tinhTrang: true, tinhTrangNgoai: true, denHanThayThe: true },
      }),
      prisma.pcccCabinet.findMany({
        where: { periodId: period.id, ...scope },
        select: { ten: true, components: true },
      }),
      prisma.pcccBulk.findMany({
        where: { periodId: period.id, ...scope },
        select: { ten: true, phanTramConLai: true },
      }),
      prisma.pcccFm200Panel.findMany({ where: { periodId: period.id, ...scope } }),
      cuongViListOf(period.id, viewScope),
      prisma.pcccSignature.count({ where: { periodId: period.id } }),
    ]);

    return ok(
      {
        bcc: summarizeExtinguishers(extinguishers, periodEndDate(period.label)),
        tcc: summarizeCabinets(cabinets),
        fcd: summarizeBulks(bulks),
        fm200: summarizeFm200(
          panels.map((p) => ({
            panelKey: p.panelKey,
            binhLabels: p.binhLabels,
            mucMin: p.mucMin,
            mucMax: p.mucMax,
            mucValues: (p.mucValues ?? {}) as Record<string, number | null>,
            apMin: p.apMin,
            apMax: p.apMax,
            apValues: (p.apValues ?? {}) as Record<string, number | null>,
          }))
        ),
      },
      {
        period,
        cuongVi: cuongVi ?? "ALL",
        machine: machine ?? "ALL",
        cuongViList,
        signatureCount,
        viewScope: pcccViewScopeMeta(viewScope),
      }
    );
  });
}
