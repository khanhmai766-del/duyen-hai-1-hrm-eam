import type { PrismaClient } from "@prisma/client";
import { getAnnualSummary } from "@/lib/chemical-inventory/queries";
import { periodKeyOf } from "@/lib/chemical-inventory/normalize";
import { toNumber, toNumberRequired } from "@/lib/chemical-inventory/serialize";
import { annualPlanGroupOfCategory, annualPlanNameKey } from "@/lib/material-annual-plan-import";

export type AnnualPlanMonthValue = {
  month: number;
  status: "LOCKED" | "DRAFT" | "CLOSED";
  usedQuantity: number | null;
  draftQuantity: number | null;
};

export type AnnualPlanSummaryRow = {
  id: string;
  year: number;
  materialCategory: string;
  materialNameLabel: string;
  materialNameKey: string;
  erpCode: string | null;
  materialId: string | null;
  materialCode: string | null;
  unitLabel: string;
  route: "CHEMICAL" | "MATERIAL";
  routeLabel: string;
  plannedQuantity: number;
  plannedSource: "CHEMICAL_FORECAST" | "CHEMICAL_CONTRACT" | "ANNUAL_PLAN";
  usedQuantity: number;
  draftUsedQuantity: number;
  remainingQuantity: number;
  stockQuantity: number;
  draftStockQuantity: number | null;
  months: AnnualPlanMonthValue[];
  note: string | null;
};

const sum = (values: Array<number | null | undefined>) =>
  values.reduce<number>((total, value) => total + (value ?? 0), 0);

export async function getMaterialAnnualPlanSummary(prisma: PrismaClient, year: number) {
  /**
   * Kỳ chốt theo GIỜ VIỆT NAM, dùng chung một quy tắc với sổ hóa chất (`periodKeyOf`).
   *
   * Trước đây mốc năm và chỉ số tháng đều lấy theo UTC, nên việc thay thế trong 7 giờ đầu mỗi
   * tháng theo giờ VN bị tính lùi về tháng trước — và tháng 1 thì rơi hẳn sang năm trước.
   *
   * Truy vấn nới rộng biên ±1 ngày để chắc chắn không sót bản ghi nằm sát ranh giới, rồi lọc
   * chính xác bằng chính `periodKeyOf` ở vòng lặp bên dưới. Làm vậy để KHÔNG phải viết lại phép
   * cộng bù giờ ở đây — thêm một bản sao là thêm một chỗ để lệch nhau về sau.
   */
  const BOUNDARY_MS = 24 * 60 * 60 * 1000;
  const from = new Date(Date.UTC(year, 0, 1) - BOUNDARY_MS);
  const to = new Date(Date.UTC(year + 1, 0, 1) + BOUNDARY_MS);
  const [plans, chemicalAnnual, periods, chemicalItems, contracts, logs, lots] = await Promise.all([
    prisma.materialAnnualPlan.findMany({
      where: { year },
      orderBy: [{ materialCategory: "asc" }, { materialNameLabel: "asc" }],
      include: { material: { select: { id: true, code: true, name: true } } },
    }),
    getAnnualSummary(prisma, year),
    prisma.chemicalInventoryPeriod.findMany({
      where: { periodKey: { gte: `${year}-01`, lte: `${year}-12` }, isSeed: false },
      select: { periodKey: true, status: true },
    }),
    prisma.chemicalInventoryItem.findMany({
      where: { isActive: true, materialCode: { not: null } },
      select: { id: true, code: true, materialCode: true },
    }),
    prisma.chemicalContract.findMany({ where: { year } }),
    prisma.materialReplacementLog.findMany({
      where: {
        replacedAt: { gte: from, lt: to },
        usedQuantity: { not: null },
        OR: [{ importSource: null }, { importSource: { not: "SHEET_VT" } }],
      },
      select: {
        materialId: true,
        usedQuantity: true,
        replacedAt: true,
        material: { select: { name: true, category: true } },
      },
    }),
    prisma.materialStockLot.findMany({
      where: { quantityLeft: { gt: 0 } },
      select: { id: true, materialCode: true, erpCode: true, quantityLeft: true },
    }),
  ]);

  const periodStatus = new Map(periods.map((period) => [period.periodKey, period.status]));
  const chemicalByMaterialCode = new Map(
    chemicalItems.flatMap((item) => item.materialCode ? [[item.materialCode.trim().toUpperCase(), item] as const] : []),
  );
  const chemicalAnnualByItem = new Map(chemicalAnnual.rows.map((row) => [row.itemId, row]));
  const contractByItem = new Map(contracts.map((contract) => [contract.itemId, contract]));

  /**
   * Thực dùng gom theo HAI khoá, vì kế hoạch và lịch sử không cùng một khoá.
   *
   * Kế hoạch khoá theo `(nhóm, tên chữ chuẩn hoá)` — đó là quyết định nghiệp vụ, vì phần lớn
   * dòng của biểu QLVT.20 không tra được `materialId` trong Danh mục Vận hành 1 (đo trên file
   * thật tháng 8.2026: 196/196 dòng mạch vật tư không có `materialId`). Nếu chỉ ghép theo
   * `materialId` thì cột "Luỹ kế đã sử dụng" của gần như toàn bộ mạch vật tư sẽ luôn bằng 0 và
   * cột "Còn lại" luôn bằng nguyên kế hoạch — báo cáo trông hợp lệ nhưng sai.
   *
   * Tra `materialId` trước (chính xác nhất), không có thì rơi về khoá tên đúng như kế hoạch.
   * Hai đường không thể đếm trùng: khoá duy nhất của kế hoạch là `(năm, nhóm, tên)` nên một
   * dòng log chỉ rơi vào đúng một dòng kế hoạch.
   */
  const materialUsageById = new Map<string, number[]>();
  const materialUsageByNameKey = new Map<string, number[]>();
  const addUsage = (bucket: Map<string, number[]>, key: string, monthIndex: number, value: number) => {
    const months = bucket.get(key) ?? Array<number>(12).fill(0);
    months[monthIndex] += value;
    bucket.set(key, months);
  };
  for (const log of logs) {
    const periodKey = periodKeyOf(log.replacedAt);
    // Bản ghi lọt vào phần biên nới rộng nhưng thuộc năm khác — bỏ qua.
    if (!periodKey.startsWith(`${year}-`)) continue;
    const monthIndex = Number(periodKey.slice(5, 7)) - 1;
    const value = log.usedQuantity ?? 0;
    if (log.materialId) addUsage(materialUsageById, log.materialId, monthIndex, value);
    if (log.material?.name) {
      const key = `${annualPlanGroupOfCategory(log.material.category)}|${annualPlanNameKey(log.material.name)}`;
      addUsage(materialUsageByNameKey, key, monthIndex, value);
    }
  }

  const rows: AnnualPlanSummaryRow[] = plans.map((plan) => {
    const planQuantity = toNumberRequired(plan.plannedQuantity);
    const chemicalItem = plan.erpCode ? chemicalByMaterialCode.get(plan.erpCode.trim().toUpperCase()) ?? null : null;
    if (chemicalItem) {
      const annual = chemicalAnnualByItem.get(chemicalItem.id);
      const contract = contractByItem.get(chemicalItem.id);
      const forecast = toNumber(contract?.forecastDemand);
      const contracted = toNumber(contract?.contractQuantity);
      const plannedQuantity = forecast && forecast > 0 ? forecast : contracted ?? planQuantity;
      const plannedSource: AnnualPlanSummaryRow["plannedSource"] = forecast && forecast > 0
        ? "CHEMICAL_FORECAST"
        : contracted !== null ? "CHEMICAL_CONTRACT" : "ANNUAL_PLAN";
      const months: AnnualPlanMonthValue[] = Array.from({ length: 12 }, (_, index) => {
        const periodKey = `${year}-${String(index + 1).padStart(2, "0")}`;
        const status = periodStatus.get(periodKey);
        const consumed = annual?.consumed[index] ?? null;
        return {
          month: index + 1,
          status: status === "LOCKED" ? "LOCKED" : status === "DRAFT" ? "DRAFT" : "CLOSED",
          usedQuantity: status === "LOCKED" ? consumed : null,
          draftQuantity: status === "DRAFT" ? consumed : null,
        };
      });
      const officialStock = [...months].reverse().find((month) => month.status === "LOCKED" && (annual?.closing[month.month - 1] ?? null) !== null);
      const draftStock = [...months].reverse().find((month) => month.status === "DRAFT" && (annual?.closing[month.month - 1] ?? null) !== null);
      const usedQuantity = sum(months.map((month) => month.usedQuantity));
      const draftUsedQuantity = sum(months.map((month) => month.draftQuantity));
      return {
        id: plan.id,
        year: plan.year,
        materialCategory: plan.materialCategory,
        materialNameLabel: plan.materialNameLabel,
        materialNameKey: plan.materialNameKey,
        erpCode: plan.erpCode,
        materialId: plan.materialId,
        materialCode: plan.material?.code ?? null,
        unitLabel: plan.unitLabel,
        route: "CHEMICAL",
        routeLabel: "Tịnh kho hóa chất",
        plannedQuantity,
        plannedSource,
        usedQuantity,
        draftUsedQuantity,
        remainingQuantity: plannedQuantity - usedQuantity,
        stockQuantity: officialStock ? annual?.closing[officialStock.month - 1] ?? 0 : 0,
        draftStockQuantity: draftStock ? annual?.closing[draftStock.month - 1] ?? null : null,
        months,
        note: plan.note,
      };
    }

    const materialMonths = (plan.materialId ? materialUsageById.get(plan.materialId) : undefined)
      ?? materialUsageByNameKey.get(`${plan.materialCategory}|${plan.materialNameKey}`)
      ?? Array<number>(12).fill(0);
    const matchingLots = lots.filter((lot) =>
      (plan.material?.code && lot.materialCode === plan.material.code)
      || (plan.erpCode && lot.erpCode?.trim().toUpperCase() === plan.erpCode.trim().toUpperCase()),
    );
    const usedQuantity = sum(materialMonths);
    return {
      id: plan.id,
      year: plan.year,
      materialCategory: plan.materialCategory,
      materialNameLabel: plan.materialNameLabel,
      materialNameKey: plan.materialNameKey,
      erpCode: plan.erpCode,
      materialId: plan.materialId,
      materialCode: plan.material?.code ?? null,
      unitLabel: plan.unitLabel,
      route: "MATERIAL",
      routeLabel: "Mạch vật tư",
      plannedQuantity: planQuantity,
      plannedSource: "ANNUAL_PLAN",
      usedQuantity,
      draftUsedQuantity: 0,
      remainingQuantity: planQuantity - usedQuantity,
      stockQuantity: matchingLots.reduce((total, lot) => total + lot.quantityLeft, 0),
      draftStockQuantity: null,
      months: materialMonths.map((value, index) => ({
        month: index + 1,
        status: "LOCKED",
        usedQuantity: value,
        draftQuantity: null,
      })),
      note: plan.note,
    };
  });

  return {
    year,
    rows,
    periods: Array.from({ length: 12 }, (_, index) => {
      const periodKey = `${year}-${String(index + 1).padStart(2, "0")}`;
      return { periodKey, status: periodStatus.get(periodKey) ?? "CLOSED" };
    }),
    summary: {
      rowCount: rows.length,
      chemicalRows: rows.filter((row) => row.route === "CHEMICAL").length,
      materialRows: rows.filter((row) => row.route === "MATERIAL").length,
      lockedChemicalPeriods: periods.filter((period) => period.status === "LOCKED").length,
      draftChemicalPeriods: periods.filter((period) => period.status === "DRAFT").length,
    },
  };
}
