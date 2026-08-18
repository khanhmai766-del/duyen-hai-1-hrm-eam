import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  PCCC_PERMISSION,
  cuongViListOf,
  pcccBulkViewScope,
  pcccCabinetViewScope,
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
  summarizeAlarmButtons,
  summarizeValves,
  summarizeEmergencyLights,
  summarizeHoseReels,
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
    // Tu chua chay: cuong vi duoc giao tron bang thi dem het (xem lib/pccc-service.ts).
    const scopeTcc = scopeWhere(cuongVi, machine, pcccCabinetViewScope(viewScope, user));
    // Bang Binh chua chay co cot Nguoi giam sat -> cap giam sat xem duoc phan minh giam sat.
    const scopeBcc = scopeWhere(cuongVi, machine, viewScope, { withSupervisor: true });
    // Foam/CO2/Diesel/FM200 la tai san dung chung -> moi cuong vi deu xem het.
    const scopeFcd = scopeWhere(cuongVi, machine, pcccBulkViewScope(viewScope));

    const [
      extinguishers,
      cabinets,
      bulks,
      panels,
      alarmButtons,
      valves,
      lights,
      hoseReels,
      cuongViList,
      signatureCount,
    ] = await Promise.all([
      prisma.pcccExtinguisher.findMany({
        where: { periodId: period.id, ...scopeBcc },
        select: { chungLoai: true, tinhTrang: true, tinhTrangNgoai: true, denHanThayThe: true },
      }),
      prisma.pcccCabinet.findMany({
        where: { periodId: period.id, ...scopeTcc },
        select: { ten: true, components: true },
      }),
      prisma.pcccBulk.findMany({
        where: { periodId: period.id, ...scopeFcd },
        select: { ten: true, phanTramConLai: true },
      }),
      prisma.pcccFm200Panel.findMany({ where: { periodId: period.id, ...scopeFcd } }),
      // Ba bảng dưới đây CÓ cột Người giám sát nên dùng chung phạm vi với bình chữa cháy.
      prisma.pcccAlarmButton.findMany({
        where: { periodId: period.id, ...scopeBcc },
        select: { tinhTrangTongThe: true, components: true },
      }),
      prisma.pcccValve.findMany({
        where: { periodId: period.id, ...scopeBcc },
        select: { loaiVan: true, tinhTrang: true },
      }),
      prisma.pcccEmergencyLight.findMany({
        where: { periodId: period.id, ...scopeBcc },
        select: { loai: true, tinhTrang: true },
      }),
      // Cuộn vòi là danh mục con của tủ nên đi theo ĐÚNG phạm vi của tủ.
      prisma.pcccHoseReel.findMany({
        where: { periodId: period.id, ...scopeTcc },
        // Tên tủ cha cần cho phần RON: phải biết cuộn vòi thuộc nhánh INDOOR hay OUTDOOR.
        select: { tinhTrangTongThe: true, components: true, cabinet: { select: { ten: true } } },
      }),
      cuongViListOf(period.id, viewScope),
      prisma.pcccSignature.count({ where: { periodId: period.id } }),
    ]);

    return ok(
      {
        bcc: summarizeExtinguishers(extinguishers, periodEndDate(period.label)),
        // Ron lăng phun đọc ở bảng cuộn vòi từ 2026-08-18 — xem summarizeRon.
        tcc: summarizeCabinets(
          cabinets,
          hoseReels.map((r) => ({ cabinetTen: r.cabinet.ten, components: r.components }))
        ),
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
        nnbc: summarizeAlarmButtons(alarmButtons),
        van: summarizeValves(valves),
        den: summarizeEmergencyLights(lights),
        cvcc: summarizeHoseReels(hoseReels),
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
