import type { PrismaClient } from "@prisma/client";
import { toNumberRequired } from "@/lib/chemical-inventory/serialize";
import { ANNUAL_PLAN_GROUPS, type AnnualPlanGroup } from "@/lib/material-annual-plan-import";
import { getMaterialAnnualPlanSummary, type AnnualPlanSummaryRow } from "@/lib/material-annual-plan-summary";

/**
 * Biểu QLVT.20 "Biểu tổng hợp nhu cầu vật tư" của MỘT tháng, dựng từ số liệu hệ thống.
 *
 * Bản Excel đang dùng để cả 12 cột cho người gõ tay, nên số liệu trôi: đo trên file tháng
 * 8.2026 thấy 41/238 dòng có G ≠ E − F, 20 mã mang chỉ tiêu năm mâu thuẫn nhau giữa các dòng,
 * và luỹ kế của dầu Total Preslia 32 đứng yên ở 832 lít suốt ba tháng trong khi vẫn tiếp tục
 * yêu cầu thêm 1.248 lít.
 *
 * Ở đây CHỈ hai cột còn do người dùng nhập:
 *   H — số lượng yêu cầu trong tháng   (MaterialMonthlyRequest.quantity)
 *   J — mục đích, vị trí sử dụng        (MaterialMonthlyRequest.purpose)
 * Mọi cột còn lại đều suy ra, và G luôn bằng E − F chứ không phải một ô nhập riêng.
 */

/** Thứ tự ba nhóm đúng như biểu gốc. */
export const MONTHLY_REPORT_GROUPS: AnnualPlanGroup[] = [
  ANNUAL_PLAN_GROUPS.OIL,
  ANNUAL_PLAN_GROUPS.FILTER,
  ANNUAL_PLAN_GROUPS.OTHER,
];

export type MonthlyReportRow = {
  /** Dòng nhu cầu tháng; null = vật tư có chỉ tiêu năm nhưng tháng này chưa khai nhu cầu. */
  requestId: string | null;
  materialCategory: string;
  materialNameKey: string;
  materialNameLabel: string;
  erpCode: string | null;
  unitLabel: string;
  route: "CHEMICAL" | "MATERIAL";

  /** E — chỉ tiêu năm. */
  plannedQuantity: number;
  /** F — luỹ kế đã sử dụng trong năm. */
  usedQuantity: number;
  /** G — còn lại so với kế hoạch. LUÔN là E − F, không lưu cột riêng. */
  remainingQuantity: number;
  /** H — số lượng yêu cầu trong tháng. */
  requestedQuantity: number | null;
  /** I và K — tồn theo lô. */
  stockQuantity: number;
  /** J — mục đích, vị trí sử dụng. */
  purpose: string | null;
  /** L — người đề xuất. */
  proposerName: string | null;
  /** M–X — tháng nào trong năm có phát sinh sử dụng. */
  monthMarks: boolean[];
  /** Tháng chưa chốt sổ hóa chất thì số liệu chỉ là tạm tính. */
  provisional: boolean;
  note: string | null;
};

export type MonthlyReportResult = {
  periodKey: string;
  year: number;
  month: number;
  groups: Array<{ group: string; rows: MonthlyReportRow[] }>;
  summary: {
    rowCount: number;
    requestRowCount: number;
    planOnlyRowCount: number;
    requestedTotalByUnit: Array<{ unitLabel: string; quantity: number }>;
  };
};

export function parsePeriodKey(raw: string | null | undefined) {
  const value = String(raw ?? "").trim();
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) return null;
  return { periodKey: value, year: Number(match[1]), month: Number(match[2]) };
}

const planKeyOf = (row: { materialCategory: string; materialNameKey: string }) =>
  `${row.materialCategory}|${row.materialNameKey}`;

export async function getMaterialMonthlyReport(
  prisma: PrismaClient,
  period: { periodKey: string; year: number; month: number },
): Promise<MonthlyReportResult> {
  const [summary, requests] = await Promise.all([
    getMaterialAnnualPlanSummary(prisma, period.year),
    prisma.materialMonthlyRequest.findMany({
      where: { periodKey: period.periodKey },
      orderBy: [{ materialCategory: "asc" }, { materialNameLabel: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const planByKey = new Map<string, AnnualPlanSummaryRow>(
    summary.rows.map((row) => [planKeyOf(row), row]),
  );

  /**
   * Lưới T1..T12 đánh dấu tháng CÓ PHÁT SINH SỬ DỤNG, không phải tháng có yêu cầu.
   *
   * Biểu gốc để người dùng tự tick nên các ô lẫn lộn "T7" với "t7" và tick sót. Suy từ số thực
   * dùng thì lưới luôn khớp với cột F ngay bên cạnh.
   */
  const marksOf = (plan: AnnualPlanSummaryRow | undefined) =>
    Array.from({ length: 12 }, (_, index) => (plan?.months[index]?.usedQuantity ?? 0) > 0);

  const rowOfRequest = (request: (typeof requests)[number]): MonthlyReportRow => {
    const plan = planByKey.get(planKeyOf(request));
    return {
      requestId: request.id,
      materialCategory: request.materialCategory,
      materialNameKey: request.materialNameKey,
      materialNameLabel: plan?.materialNameLabel ?? request.materialNameLabel,
      erpCode: request.erpCode ?? plan?.erpCode ?? null,
      unitLabel: request.unitLabel || plan?.unitLabel || "",
      route: plan?.route ?? "MATERIAL",
      plannedQuantity: plan?.plannedQuantity ?? 0,
      usedQuantity: plan?.usedQuantity ?? 0,
      // G tính tại chỗ. Đây chính là cột mà bản Excel để lệch ở 41/238 dòng.
      remainingQuantity: (plan?.plannedQuantity ?? 0) - (plan?.usedQuantity ?? 0),
      requestedQuantity: toNumberRequired(request.quantity),
      stockQuantity: plan?.stockQuantity ?? 0,
      purpose: request.purpose,
      proposerName: request.proposerName,
      monthMarks: marksOf(plan),
      provisional: (plan?.draftUsedQuantity ?? 0) > 0,
      note: request.note,
    };
  };

  const rows: MonthlyReportRow[] = requests.map(rowOfRequest);

  /**
   * Vật tư CÓ chỉ tiêu năm nhưng tháng này chưa ai khai nhu cầu vẫn phải hiện ra.
   *
   * Bản Excel chỉ liệt kê dòng đã gõ, nên một vật tư đang bị tiêu hao mà không ai khai nhu cầu
   * thì lặng lẽ biến mất khỏi biểu tháng — đúng chỗ cần nhìn thấy nhất.
   */
  const usedKeys = new Set(rows.map((row) => planKeyOf(row)));
  for (const plan of summary.rows) {
    const key = planKeyOf(plan);
    if (usedKeys.has(key)) continue;
    rows.push({
      requestId: null,
      materialCategory: plan.materialCategory,
      materialNameKey: plan.materialNameKey,
      materialNameLabel: plan.materialNameLabel,
      erpCode: plan.erpCode,
      unitLabel: plan.unitLabel,
      route: plan.route,
      plannedQuantity: plan.plannedQuantity,
      usedQuantity: plan.usedQuantity,
      remainingQuantity: plan.plannedQuantity - plan.usedQuantity,
      requestedQuantity: null,
      stockQuantity: plan.stockQuantity,
      purpose: null,
      proposerName: null,
      monthMarks: marksOf(plan),
      provisional: plan.draftUsedQuantity > 0,
      note: plan.note,
    });
  }

  const groups = MONTHLY_REPORT_GROUPS.map((group) => ({
    group,
    rows: rows
      .filter((row) => row.materialCategory === group)
      .sort((a, b) => {
        // Dòng đã khai nhu cầu lên trước, sau đó theo tên.
        if ((a.requestId === null) !== (b.requestId === null)) return a.requestId === null ? 1 : -1;
        return a.materialNameLabel.localeCompare(b.materialNameLabel, "vi");
      }),
  }));

  const requestedByUnit = new Map<string, number>();
  for (const row of rows) {
    if (row.requestedQuantity === null) continue;
    requestedByUnit.set(row.unitLabel, (requestedByUnit.get(row.unitLabel) ?? 0) + row.requestedQuantity);
  }

  return {
    periodKey: period.periodKey,
    year: period.year,
    month: period.month,
    groups,
    summary: {
      rowCount: rows.length,
      requestRowCount: rows.filter((row) => row.requestId !== null).length,
      planOnlyRowCount: rows.filter((row) => row.requestId === null).length,
      requestedTotalByUnit: [...requestedByUnit.entries()]
        .map(([unitLabel, quantity]) => ({ unitLabel, quantity }))
        .sort((a, b) => a.unitLabel.localeCompare(b.unitLabel, "vi")),
    },
  };
}
