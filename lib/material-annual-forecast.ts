import type { PrismaClient } from "@prisma/client";
import { periodKeyOf } from "@/lib/chemical-inventory/normalize";
import { annualPlanGroupOfCategory, annualPlanNameKey } from "@/lib/material-annual-plan-import";
import { getCachedMaterialAnnualPlanSummary } from "@/lib/material-annual-plan-cache";

/**
 * Dự toán nhu cầu vật tư cho năm sau.
 *
 *   Nhu cầu năm sau = Nhu cầu định kỳ
 *                   + Bình quân phát sinh
 *                   × Hệ số dự phòng
 *                   − Tồn có thể dùng chuyển năm
 *
 * BA THÀNH PHẦN PHẢI TÁCH RỜI trên kết quả trả về, không gộp sẵn thành một con số. Nhu cầu định
 * kỳ tính được chính xác từ chu kỳ và số thiết bị của từng điểm; nhu cầu phát sinh thì chỉ ước
 * lượng được bằng trung bình lịch sử. Gộp chung là mất khả năng giải trình khi bị hỏi "căn cứ
 * đâu ra con số này".
 */

/** Hệ số dự phòng mặc định theo nhóm của biểu QLVT.20. */
export const DEFAULT_BUFFER_RATIOS: Record<string, number> = {
  "I. Dầu nhớt bôi trơn": 1.1,
  "II. Lọc dầu và lọc nước": 1.1,
  "III. Chai khí, hạt nhựa, dầu DO, hóa chất và vật tư phụ khác": 1.15,
};

/** Số năm lịch sử lấy để tính bình quân phát sinh. */
export const UNPLANNED_LOOKBACK_YEARS = 3;

export type ForecastRow = {
  materialCategory: string;
  materialNameKey: string;
  materialNameLabel: string;
  erpCode: string | null;
  unitLabel: string;
  route: "CHEMICAL" | "MATERIAL";
  /** Σ quantity × deviceCount của các điểm có nextDueAt rơi vào năm dự toán. */
  scheduledDemand: number;
  /** Số điểm đến hạn trong năm — để giải trình con số trên. */
  scheduledPointCount: number;
  /** Trung bình phần thực dùng KHÔNG gắn điểm của các năm gần nhất. */
  unplannedAverage: number;
  /** Số năm thực sự có dữ liệu phát sinh; 0 nghĩa là chưa có căn cứ. */
  unplannedYears: number;
  bufferRatio: number;
  /** (định kỳ + phát sinh) × hệ số dự phòng. */
  grossDemand: number;
  /** Tồn theo lô còn dùng được, chuyển sang năm sau. */
  carryOverStock: number;
  /** Kết quả cuối, không âm. */
  netDemand: number;
  /** Chỉ tiêu năm hiện tại, để so sánh. */
  currentPlannedQuantity: number | null;
  currentUsedQuantity: number | null;
};

export type ForecastResult = {
  baseYear: number;
  targetYear: number;
  lookbackYears: number;
  rows: ForecastRow[];
  summary: {
    rowCount: number;
    scheduledOnlyRows: number;
    unplannedOnlyRows: number;
    rowsWithoutHistory: number;
  };
};

const round4 = (value: number) => Math.round(value * 10000) / 10000;

export async function getMaterialAnnualForecast(
  prisma: PrismaClient,
  targetYear: number,
  options?: { bufferRatios?: Record<string, number> },
): Promise<ForecastResult> {
  const baseYear = targetYear - 1;
  const bufferRatios = { ...DEFAULT_BUFFER_RATIOS, ...(options?.bufferRatios ?? {}) };

  // Nới biên ±1 ngày rồi lọc lại bằng `periodKeyOf` — cùng cách chốt kỳ theo giờ VN với sổ hóa
  // chất, xem chú thích ở lib/material-annual-plan-summary.ts.
  const BOUNDARY_MS = 24 * 60 * 60 * 1000;
  const historyFrom = new Date(Date.UTC(baseYear - UNPLANNED_LOOKBACK_YEARS + 1, 0, 1) - BOUNDARY_MS);
  const historyTo = new Date(Date.UTC(baseYear + 1, 0, 1) + BOUNDARY_MS);

  const [currentSummary, duePoints, unplannedLogs, lots] = await Promise.all([
    getCachedMaterialAnnualPlanSummary(prisma, baseYear),
    prisma.materialReplacement.findMany({
      where: {
        isActive: true,
        intervalMonths: { gt: 0 },
        nextDueAt: {
          gte: new Date(Date.UTC(targetYear, 0, 1) - BOUNDARY_MS),
          lt: new Date(Date.UTC(targetYear + 1, 0, 1) + BOUNDARY_MS),
        },
      },
      select: {
        quantity: true,
        deviceCount: true,
        nextDueAt: true,
        material: { select: { name: true, unit: true, category: true } },
      },
    }),
    prisma.materialReplacementLog.findMany({
      where: {
        unplanned: true,
        usedQuantity: { not: null },
        replacedAt: { gte: historyFrom, lt: historyTo },
        OR: [{ importSource: null }, { importSource: { not: "SHEET_VT" } }],
      },
      select: {
        usedQuantity: true,
        replacedAt: true,
        unitLabel: true,
        material: { select: { name: true, category: true } },
      },
    }),
    prisma.materialStockLot.findMany({
      where: { quantityLeft: { gt: 0 } },
      select: { materialCode: true, erpCode: true, quantityLeft: true },
    }),
  ]);

  type Bucket = {
    materialCategory: string;
    materialNameKey: string;
    materialNameLabel: string;
    erpCode: string | null;
    unitLabel: string;
    route: "CHEMICAL" | "MATERIAL";
    scheduledDemand: number;
    scheduledPointCount: number;
    unplannedByYear: Map<number, number>;
    carryOverStock: number;
    currentPlannedQuantity: number | null;
    currentUsedQuantity: number | null;
  };

  const buckets = new Map<string, Bucket>();
  const keyOf = (category: string, nameKey: string) => `${category}|${nameKey}`;
  const bucketFor = (category: string, nameKey: string, seed: Partial<Bucket> = {}) => {
    const key = keyOf(category, nameKey);
    const existing = buckets.get(key);
    if (existing) return existing;
    const created: Bucket = {
      materialCategory: category,
      materialNameKey: nameKey,
      materialNameLabel: seed.materialNameLabel ?? nameKey,
      erpCode: seed.erpCode ?? null,
      unitLabel: seed.unitLabel ?? "",
      route: seed.route ?? "MATERIAL",
      scheduledDemand: 0,
      scheduledPointCount: 0,
      unplannedByYear: new Map(),
      carryOverStock: 0,
      currentPlannedQuantity: null,
      currentUsedQuantity: null,
    };
    buckets.set(key, created);
    return created;
  };

  // Nền: mọi dòng kế hoạch của năm hiện tại, kể cả loại không đến hạn năm sau — người lập kế
  // hoạch vẫn cần thấy chúng để đối chiếu.
  for (const plan of currentSummary.rows) {
    const bucket = bucketFor(plan.materialCategory, plan.materialNameKey, {
      materialNameLabel: plan.materialNameLabel,
      erpCode: plan.erpCode,
      unitLabel: plan.unitLabel,
      route: plan.route,
    });
    bucket.currentPlannedQuantity = plan.plannedQuantity;
    bucket.currentUsedQuantity = plan.usedQuantity;
    bucket.carryOverStock = plan.stockQuantity;
  }

  // 1) Nhu cầu ĐỊNH KỲ — đếm được chính xác từ lịch thay thế.
  for (const point of duePoints) {
    if (!point.material) continue;
    if (periodKeyOf(point.nextDueAt).slice(0, 4) !== String(targetYear)) continue;
    const category = annualPlanGroupOfCategory(point.material.category);
    const nameKey = annualPlanNameKey(point.material.name);
    const bucket = bucketFor(category, nameKey, {
      materialNameLabel: point.material.name,
      unitLabel: point.material.unit,
    });
    if (!bucket.unitLabel) bucket.unitLabel = point.material.unit;
    bucket.scheduledDemand += point.quantity * Math.max(1, point.deviceCount);
    bucket.scheduledPointCount += 1;
  }

  // 2) Nhu cầu PHÁT SINH — chỉ ước lượng được bằng trung bình các năm gần nhất.
  for (const log of unplannedLogs) {
    if (!log.material?.name) continue;
    const year = Number(periodKeyOf(log.replacedAt).slice(0, 4));
    if (year > baseYear || year < baseYear - UNPLANNED_LOOKBACK_YEARS + 1) continue;
    const category = annualPlanGroupOfCategory(log.material.category);
    const nameKey = annualPlanNameKey(log.material.name);
    const bucket = bucketFor(category, nameKey, {
      materialNameLabel: log.material.name,
      unitLabel: log.unitLabel ?? "",
    });
    if (!bucket.unitLabel && log.unitLabel) bucket.unitLabel = log.unitLabel;
    bucket.unplannedByYear.set(year, (bucket.unplannedByYear.get(year) ?? 0) + (log.usedQuantity ?? 0));
  }

  // 3) Tồn chuyển năm cho những dòng chưa lấy được từ kế hoạch (vật tư mới xuất hiện).
  for (const bucket of buckets.values()) {
    if (bucket.carryOverStock > 0 || !bucket.erpCode) continue;
    const code = bucket.erpCode.trim().toUpperCase();
    bucket.carryOverStock = lots
      .filter((lot) => lot.erpCode?.trim().toUpperCase() === code || lot.materialCode.toUpperCase() === code)
      .reduce((total, lot) => total + lot.quantityLeft, 0);
  }

  const rows: ForecastRow[] = [...buckets.values()].map((bucket) => {
    const years = [...bucket.unplannedByYear.values()];
    const unplannedAverage = years.length > 0 ? years.reduce((a, b) => a + b, 0) / years.length : 0;
    const bufferRatio = bufferRatios[bucket.materialCategory] ?? 1;
    const grossDemand = (bucket.scheduledDemand + unplannedAverage) * bufferRatio;
    const netDemand = Math.max(0, grossDemand - bucket.carryOverStock);
    return {
      materialCategory: bucket.materialCategory,
      materialNameKey: bucket.materialNameKey,
      materialNameLabel: bucket.materialNameLabel,
      erpCode: bucket.erpCode,
      unitLabel: bucket.unitLabel,
      route: bucket.route,
      scheduledDemand: round4(bucket.scheduledDemand),
      scheduledPointCount: bucket.scheduledPointCount,
      unplannedAverage: round4(unplannedAverage),
      unplannedYears: years.length,
      bufferRatio,
      grossDemand: round4(grossDemand),
      carryOverStock: round4(bucket.carryOverStock),
      netDemand: round4(netDemand),
      currentPlannedQuantity: bucket.currentPlannedQuantity,
      currentUsedQuantity: bucket.currentUsedQuantity,
    };
  });

  rows.sort((a, b) =>
    a.materialCategory.localeCompare(b.materialCategory, "vi")
    || b.netDemand - a.netDemand
    || a.materialNameLabel.localeCompare(b.materialNameLabel, "vi"));

  return {
    baseYear,
    targetYear,
    lookbackYears: UNPLANNED_LOOKBACK_YEARS,
    rows,
    summary: {
      rowCount: rows.length,
      scheduledOnlyRows: rows.filter((row) => row.scheduledDemand > 0 && row.unplannedAverage === 0).length,
      unplannedOnlyRows: rows.filter((row) => row.scheduledDemand === 0 && row.unplannedAverage > 0).length,
      // Dòng chưa có căn cứ nào — người lập kế hoạch phải tự quyết, hệ thống không đoán hộ.
      rowsWithoutHistory: rows.filter((row) => row.scheduledDemand === 0 && row.unplannedYears === 0).length,
    },
  };
}
