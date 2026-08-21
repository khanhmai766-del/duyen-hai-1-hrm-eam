import type { PrismaClient } from "@prisma/client";
import { positionLabelOf } from "@/lib/position-catalog";
import { normalizeText } from "@/lib/nav";
import {
  INVENTORY_POSITION_CODES,
  UNASSIGNED_POSITION,
  type BaseUnit,
  type ChemicalItemType,
  type WarningCode,
} from "./constants";
import {
  calculateClosingTotal,
  calculateConsumedTotal,
  calculateContractProgress,
  calculateContractRemaining,
  calculateContractShortfall,
  calculateContractSurplus,
  calculateDailyUsed,
  calculateSpecificConsumption,
  convertUnit,
  inspectDailyRow,
  inspectMonthlyRow,
  medianUsage,
  roundToStorage,
} from "./calculations";
import { lastDateOfPeriod, previousPeriodKey } from "./normalize";
import { toNumber } from "./serialize";

/**
 * Truy vấn tổng hợp cho sổ tồn kho hóa chất.
 *
 * Mọi con số dẫn xuất (tồn đầu, tổng nhập, lượng sử dụng, còn lại theo hợp đồng)
 * đều TÍNH Ở ĐÂY từ dữ liệu gốc, không đọc từ cột lưu sẵn — đó là lý do module này
 * không mắc lại các lỗi của sổ Excel.
 *
 * Mọi Decimal đi qua `toNumber()` trước khi ra khỏi tệp này: API contract là `number`.
 */

// ---------------------------------------------------------------------------
// Kiểu trả về
// ---------------------------------------------------------------------------

export type PositionColumn = { code: string; label: string };

export type GridCell = {
  readingId: string | null;
  quantity: number | null;
  rawText: string | null;
  note: string | null;
  source: string | null;
};

export type MonthlyGridRow = {
  itemId: string;
  code: string;
  name: string;
  itemType: ChemicalItemType;
  baseUnit: BaseUnit;
  displayUnit: BaseUnit | null;
  trackingMode: string;
  sheetRow: number | null;
  tankCapacity: number | null;
  lowStockThreshold: number | null;
  cells: Record<string, GridCell>;
  closingTotal: number | null;
  openingTotal: number | null;
  receivedTotal: number | null;
  consumedTotal: number | null;
  receiptCount: number;
  /** Mặt hàng theo dõi hằng ngày thì ô tồn cuối do hệ thống sinh, không cho gõ tay. */
  editable: boolean;
  warnings: WarningCode[];
};

export type UnitTotals = { closing: number | null; received: number | null; consumed: number | null };

export type MonthlyGrid = {
  period: {
    periodKey: string;
    status: string;
    isSeed: boolean;
    generationMwh: number | null;
    lockedAt: string | null;
    note: string | null;
    exists: boolean;
  };
  previousPeriodKey: string;
  positions: PositionColumn[];
  rows: MonthlyGridRow[];
  totalsByUnit: Record<string, UnitTotals>;
  /** Suất hao đầu cực của NH3, kg/MWh. Null khi chưa nhập sản lượng điện. */
  specificConsumption: number | null;
  warningCount: number;
};

// ---------------------------------------------------------------------------
// Lưới tồn kho tháng
// ---------------------------------------------------------------------------

export async function getMonthlyGrid(
  prisma: PrismaClient,
  periodKey: string,
  filters: { q?: string; itemType?: string; position?: string } = {}
): Promise<MonthlyGrid> {
  const prevKey = previousPeriodKey(periodKey);

  // Bốn truy vấn, không N+1: danh mục · kỳ · bản đọc hai kỳ · tổng nhập theo mặt hàng.
  const [items, periods, readings, receiptGroups] = await Promise.all([
    prisma.chemicalInventoryItem.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.chemicalInventoryPeriod.findMany({ where: { periodKey: { in: [periodKey, prevKey] } } }),
    prisma.chemicalStockReading.findMany({
      where: { periodKey: { in: [periodKey, prevKey] }, kind: "MONTH_END" },
    }),
    prisma.chemicalReceipt.groupBy({
      by: ["itemId"],
      where: { periodKey },
      _sum: { acceptedWeight: true },
      _count: { _all: true },
    }),
  ]);

  const period = periods.find((p) => p.periodKey === periodKey) ?? null;

  const currentByItem = new Map<string, typeof readings>();
  const previousByItem = new Map<string, typeof readings>();
  for (const reading of readings) {
    const bucket = reading.periodKey === periodKey ? currentByItem : previousByItem;
    const list = bucket.get(reading.itemId) ?? [];
    list.push(reading);
    bucket.set(reading.itemId, list);
  }

  const receivedByItem = new Map(receiptGroups.map((g) => [g.itemId, g]));

  const positions: PositionColumn[] = INVENTORY_POSITION_CODES.map((code) => ({
    code,
    label: positionLabelOf(code) ?? code,
  }));

  const queryKey = filters.q ? normalizeText(filters.q) : null;
  const rows: MonthlyGridRow[] = [];

  for (const item of items) {
    if (filters.itemType && item.itemType !== filters.itemType) continue;
    if (queryKey && !normalizeText(`${item.name} ${item.code}`).includes(queryKey)) continue;

    const current = currentByItem.get(item.id) ?? [];
    const previous = previousByItem.get(item.id) ?? [];

    const cells: Record<string, GridCell> = {};
    for (const reading of current) {
      cells[reading.positionCode] = {
        readingId: reading.id,
        quantity: toNumber(reading.quantity),
        rawText: reading.rawText,
        note: reading.note,
        source: reading.source,
      };
    }

    if (filters.position && !cells[filters.position]) continue;

    const closingTotal = calculateClosingTotal(current.map((r) => toNumber(r.quantity)));
    const openingTotal = calculateClosingTotal(previous.map((r) => toNumber(r.quantity)));
    const group = receivedByItem.get(item.id);
    const receivedTotal = toNumber(group?._sum.acceptedWeight ?? null);
    // Kỳ mồi chỉ mang tồn cuối, không có ý nghĩa tiêu hao.
    const consumedTotal = period?.isSeed ? null : calculateConsumedTotal(openingTotal, receivedTotal, closingTotal);

    const warnings = inspectMonthlyRow({
      openingTotal,
      previousClosingTotal: openingTotal,
      closingTotal,
      consumedTotal,
      hasReceipts: (group?._count._all ?? 0) > 0,
      hasPeriod: Boolean(period),
    });
    if (current.some((r) => r.rawText)) warnings.push("NON_NUMERIC_VALUE");
    if (item.trackingMode === "DAILY" && closingTotal === null) warnings.push("MONTH_END_INCOMPLETE");

    rows.push({
      itemId: item.id,
      code: item.code,
      name: item.name,
      itemType: item.itemType as ChemicalItemType,
      baseUnit: item.baseUnit as BaseUnit,
      displayUnit: (item.displayUnit as BaseUnit | null) ?? null,
      trackingMode: item.trackingMode,
      sheetRow: item.sheetRow,
      tankCapacity: toNumber(item.tankCapacity),
      lowStockThreshold: toNumber(item.lowStockThreshold),
      cells,
      closingTotal,
      openingTotal,
      receivedTotal,
      consumedTotal,
      receiptCount: group?._count._all ?? 0,
      editable: item.trackingMode !== "DAILY",
      warnings,
    });
  }

  // Tổng KPI tách theo đơn vị — kg, tấn và lít không bao giờ được cộng chung.
  const totalsByUnit: Record<string, UnitTotals> = {};
  for (const row of rows) {
    const bucket = (totalsByUnit[row.baseUnit] ??= { closing: null, received: null, consumed: null });
    const add = (a: number | null, b: number | null) => (a === null && b === null ? null : roundToStorage((a ?? 0) + (b ?? 0)));
    bucket.closing = add(bucket.closing, row.closingTotal);
    bucket.received = add(bucket.received, row.receivedTotal);
    bucket.consumed = add(bucket.consumed, row.consumedTotal);
  }

  const nh3 = rows.find((r) => r.code === "NH3_99");
  const generationMwh = toNumber(period?.generationMwh ?? null);
  const specificConsumption =
    nh3 && nh3.baseUnit === "KG" ? calculateSpecificConsumption(nh3.consumedTotal, generationMwh) : null;

  return {
    period: {
      periodKey,
      status: period?.status ?? "DRAFT",
      isSeed: period?.isSeed ?? false,
      generationMwh,
      lockedAt: period?.lockedAt?.toISOString() ?? null,
      note: period?.note ?? null,
      exists: Boolean(period),
    },
    previousPeriodKey: prevKey,
    positions,
    rows,
    totalsByUnit,
    specificConsumption,
    warningCount: rows.filter((r) => r.warnings.length > 0).length,
  };
}

// ---------------------------------------------------------------------------
// Nhật ký ngày
// ---------------------------------------------------------------------------

export type DailyTruck = {
  id: string;
  vehicleNumber: string | null;
  vehicleRef: string | null;
  acceptedWeight: number;
  plantWeight: number | null;
  contractorWeight: number | null;
  source: string;
  materialTicketId: string | null;
  warnings: string[];
};

export type DailyLogRow = {
  date: string;
  day: number;
  readingId: string | null;
  openingStock: number | null;
  importedToday: number | null;
  closingStock: number | null;
  used: number | null;
  trucks: DailyTruck[];
  warnings: WarningCode[];
};

export type DailyLog = {
  item: {
    id: string;
    code: string;
    name: string;
    baseUnit: BaseUnit;
    displayUnit: BaseUnit | null;
    /** Cương vị nhận/giữ mặc định — nhật ký ngày ghi bản đọc vào đúng cương vị này. */
    defaultPosition: string | null;
    tankCapacity: number | null;
    lowStockThreshold: number | null;
  };
  period: { periodKey: string; status: string; generationMwh: number | null; exists: boolean };
  rows: DailyLogRow[];
  monthOpening: number | null;
  monthReceived: number | null;
  monthClosing: number | null;
  monthConsumed: number | null;
  medianUsage: number | null;
  specificConsumption: number | null;
};

export async function getDailyLog(
  prisma: PrismaClient,
  periodKey: string,
  itemId: string
): Promise<DailyLog | null> {
  const item = await prisma.chemicalInventoryItem.findUnique({ where: { id: itemId } });
  if (!item) return null;

  const prevKey = previousPeriodKey(periodKey);
  const [period, dailyReadings, previousMonthEnd, receipts] = await Promise.all([
    prisma.chemicalInventoryPeriod.findUnique({ where: { periodKey } }),
    prisma.chemicalStockReading.findMany({
      where: { itemId, periodKey, kind: "DAILY" },
      orderBy: { readDate: "asc" },
    }),
    prisma.chemicalStockReading.findMany({ where: { itemId, periodKey: prevKey, kind: "MONTH_END" } }),
    prisma.chemicalReceipt.findMany({ where: { itemId, periodKey }, orderBy: { receivedAt: "asc" } }),
  ]);

  const monthOpening = calculateClosingTotal(previousMonthEnd.map((r) => toNumber(r.quantity)));

  const trucksByDay = new Map<number, DailyTruck[]>();
  for (const receipt of receipts) {
    const day = receipt.receivedAt.getUTCDate();
    const list = trucksByDay.get(day) ?? [];
    list.push({
      id: receipt.id,
      vehicleNumber: receipt.vehicleNumber,
      vehicleRef: receipt.vehicleRef,
      acceptedWeight: toNumber(receipt.acceptedWeight) ?? 0,
      plantWeight: toNumber(receipt.plantWeight),
      contractorWeight: toNumber(receipt.contractorWeight),
      source: receipt.source,
      materialTicketId: receipt.materialTicketId,
      warnings: receipt.warnings,
    });
    trucksByDay.set(day, list);
  }

  const readingByDay = new Map(dailyReadings.map((r) => [r.readDate.getUTCDate(), r]));
  const lastDay = lastDateOfPeriod(periodKey).getUTCDate();
  const [year, month] = periodKey.split("-").map(Number);

  // Lượt một: dựng số liệu. Trung vị phải có trước mới đánh giá được ngày bất thường.
  const draft: Array<Omit<DailyLogRow, "warnings">> = [];
  let previousClosing = monthOpening;

  for (let day = 1; day <= lastDay; day += 1) {
    const reading = readingByDay.get(day);
    const closingStock = reading ? toNumber(reading.quantity) : null;
    const trucks = trucksByDay.get(day) ?? [];
    const importedToday = trucks.length ? roundToStorage(trucks.reduce((s, t) => s + t.acceptedWeight, 0)) : null;
    const used = calculateDailyUsed(previousClosing, importedToday, closingStock);

    draft.push({
      date: new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10),
      day,
      readingId: reading?.id ?? null,
      openingStock: previousClosing,
      importedToday,
      closingStock,
      used,
      trucks,
    });

    // Ngày chưa đọc thì tồn đầu ngày kế tiếp vẫn là số đọc gần nhất — chuỗi không đứt
    // chỉ vì một ngày bỏ trống.
    if (closingStock !== null) previousClosing = closingStock;
  }

  const median = medianUsage(draft.map((r) => r.used));
  const tankCapacity = toNumber(item.tankCapacity);
  const lowStockThreshold = toNumber(item.lowStockThreshold);

  const rows: DailyLogRow[] = draft.map((row) => ({
    ...row,
    warnings: inspectDailyRow({
      openingStock: row.openingStock,
      closingStock: row.closingStock,
      previousClosingStock: row.openingStock,
      used: row.used,
      monthMedianUsage: median,
      tankCapacity,
      lowStockThreshold,
    }),
  }));

  const monthReceived = receipts.length
    ? roundToStorage(receipts.reduce((s, r) => s + (toNumber(r.acceptedWeight) ?? 0), 0))
    : null;
  const lastReading = readingByDay.get(lastDay);
  const monthClosing = lastReading ? toNumber(lastReading.quantity) : null;
  const monthConsumed = calculateConsumedTotal(monthOpening, monthReceived, monthClosing);
  const generationMwh = toNumber(period?.generationMwh ?? null);

  return {
    item: {
      id: item.id,
      code: item.code,
      name: item.name,
      baseUnit: item.baseUnit as BaseUnit,
      displayUnit: (item.displayUnit as BaseUnit | null) ?? null,
      defaultPosition: item.defaultPosition,
      tankCapacity,
      lowStockThreshold,
    },
    period: {
      periodKey,
      status: period?.status ?? "DRAFT",
      generationMwh,
      exists: Boolean(period),
    },
    rows,
    monthOpening,
    monthReceived,
    monthClosing,
    monthConsumed,
    medianUsage: median,
    specificConsumption: calculateSpecificConsumption(monthConsumed, generationMwh),
  };
}

// ---------------------------------------------------------------------------
// Tổng hợp năm
// ---------------------------------------------------------------------------

export type AnnualRow = {
  itemId: string;
  code: string;
  name: string;
  itemType: ChemicalItemType;
  baseUnit: BaseUnit;
  /** 12 phần tử; null = tháng chưa có dữ liệu, KHÔNG phải 0. */
  received: (number | null)[];
  consumed: (number | null)[];
  closing: (number | null)[];
  receivedTotal: number | null;
  consumedTotal: number | null;
  yearEndClosing: number | null;
};

export type AnnualSummary = {
  year: number;
  months: string[];
  rows: AnnualRow[];
  /** Kỳ đã mở trong năm — tháng ngoài danh sách này hiển thị "chưa có dữ liệu". */
  openPeriods: string[];
};

export async function getAnnualSummary(prisma: PrismaClient, year: number): Promise<AnnualSummary> {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const withSeed = [previousPeriodKey(months[0]), ...months];

  const [items, periods, readings, receiptGroups] = await Promise.all([
    prisma.chemicalInventoryItem.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.chemicalInventoryPeriod.findMany({ where: { periodKey: { in: withSeed } } }),
    prisma.chemicalStockReading.findMany({
      where: { periodKey: { in: withSeed }, kind: "MONTH_END" },
      select: { itemId: true, periodKey: true, quantity: true },
    }),
    prisma.chemicalReceipt.groupBy({
      by: ["itemId", "periodKey"],
      where: { periodKey: { in: months } },
      _sum: { acceptedWeight: true },
    }),
  ]);

  const closingByKey = new Map<string, number | null>();
  const grouped = new Map<string, (number | null)[]>();
  for (const reading of readings) {
    const key = `${reading.itemId}|${reading.periodKey}`;
    const list = grouped.get(key) ?? [];
    list.push(toNumber(reading.quantity));
    grouped.set(key, list);
  }
  for (const [key, values] of grouped) closingByKey.set(key, calculateClosingTotal(values));

  const receivedByKey = new Map(
    receiptGroups.map((g) => [`${g.itemId}|${g.periodKey}`, toNumber(g._sum.acceptedWeight)])
  );
  const openPeriods = periods.filter((p) => !p.isSeed).map((p) => p.periodKey);
  const openSet = new Set(periods.map((p) => p.periodKey));

  const rows: AnnualRow[] = items.map((item) => {
    const received: (number | null)[] = [];
    const consumed: (number | null)[] = [];
    const closing: (number | null)[] = [];

    for (const periodKey of months) {
      // Kỳ chưa mở thì để null — hiển thị "chưa có dữ liệu", không mặc định 0.
      if (!openSet.has(periodKey)) {
        received.push(null);
        consumed.push(null);
        closing.push(null);
        continue;
      }
      const close = closingByKey.get(`${item.id}|${periodKey}`) ?? null;
      const open = closingByKey.get(`${item.id}|${previousPeriodKey(periodKey)}`) ?? null;
      const recv = receivedByKey.get(`${item.id}|${periodKey}`) ?? null;
      received.push(recv);
      closing.push(close);
      consumed.push(calculateConsumedTotal(open, recv, close));
    }

    const sum = (values: (number | null)[]) => {
      const present = values.filter((v): v is number => v !== null);
      return present.length ? roundToStorage(present.reduce((a, b) => a + b, 0)) : null;
    };

    const lastKnownClosing = [...closing].reverse().find((v) => v !== null) ?? null;

    return {
      itemId: item.id,
      code: item.code,
      name: item.name,
      itemType: item.itemType as ChemicalItemType,
      baseUnit: item.baseUnit as BaseUnit,
      received,
      consumed,
      closing,
      receivedTotal: sum(received),
      consumedTotal: sum(consumed),
      yearEndClosing: lastKnownClosing,
    };
  });

  return { year, months, rows, openPeriods };
}

// ---------------------------------------------------------------------------
// Danh sách phiếu nhập
// ---------------------------------------------------------------------------

export type ReceiptListItem = {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  baseUnit: BaseUnit;
  receivedAt: string;
  periodKey: string;
  vehicleNumber: string | null;
  vehicleRef: string | null;
  plantWeight: number | null;
  contractorWeight: number | null;
  acceptedWeight: number;
  receivingPosition: string | null;
  receivingPositionLabel: string | null;
  receivingPositionRaw: string | null;
  note: string | null;
  source: string;
  materialTicketId: string | null;
  warnings: string[];
  /** Phiếu sinh từ phiếu vật tư chỉ được sửa, không được xóa ở màn tồn kho. */
  deletable: boolean;
};

export async function listReceipts(
  prisma: PrismaClient,
  filters: {
    periodKey?: string;
    itemId?: string;
    position?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }
): Promise<{ rows: ReceiptListItem[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));

  const where = {
    ...(filters.periodKey ? { periodKey: filters.periodKey } : {}),
    ...(filters.itemId ? { itemId: filters.itemId } : {}),
    ...(filters.position ? { receivingPosition: filters.position } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.chemicalReceipt.count({ where }),
    prisma.chemicalReceipt.findMany({
      where,
      include: { item: { select: { code: true, name: true, baseUnit: true } } },
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const mapped = rows.map((r) => ({
    id: r.id,
    itemId: r.itemId,
    itemCode: r.item.code,
    itemName: r.item.name,
    baseUnit: r.item.baseUnit as BaseUnit,
    receivedAt: r.receivedAt.toISOString().slice(0, 10),
    periodKey: r.periodKey,
    vehicleNumber: r.vehicleNumber,
    vehicleRef: r.vehicleRef,
    plantWeight: toNumber(r.plantWeight),
    contractorWeight: toNumber(r.contractorWeight),
    acceptedWeight: toNumber(r.acceptedWeight) ?? 0,
    receivingPosition: r.receivingPosition,
    receivingPositionLabel: r.receivingPosition ? positionLabelOf(r.receivingPosition) ?? r.receivingPosition : null,
    receivingPositionRaw: r.receivingPositionRaw,
    note: r.note,
    source: r.source,
    materialTicketId: r.materialTicketId,
    warnings: r.warnings,
    deletable: r.materialTicketId === null,
  }));

  // Tìm kiếm không dấu chạy sau khi lấy trang: dữ liệu mỗi tháng chỉ vài chục dòng,
  // không đáng đánh đổi bằng một cột tìm kiếm phải đồng bộ.
  if (!filters.q) return { rows: mapped, total, page, pageSize };
  const key = normalizeText(filters.q);
  const filtered = mapped.filter((r) =>
    normalizeText(
      [r.itemName, r.vehicleNumber, r.vehicleRef, r.receivingPositionLabel, r.receivingPositionRaw, r.note]
        .filter(Boolean)
        .join(" ")
    ).includes(key)
  );
  return { rows: filtered, total: filtered.length, page, pageSize };
}

// ---------------------------------------------------------------------------
// Hợp đồng
// ---------------------------------------------------------------------------

export type ContractRow = {
  id: string;
  year: number;
  itemId: string;
  itemCode: string;
  itemName: string;
  baseUnit: BaseUnit;
  materialCode: string | null;
  supplier: string | null;
  origin: string | null;
  contractQuantity: number;
  forecastDemand: number;
  /** Luôn cộng lại từ phiếu nhập — cột "đã nhận" của sổ Excel trộn lẫn lượng sử dụng. */
  received: number;
  remaining: number;
  shortfall: number;
  surplus: number;
  progress: number;
  note: string | null;
};

export async function listContracts(prisma: PrismaClient, year: number): Promise<ContractRow[]> {
  const contracts = await prisma.chemicalContract.findMany({
    where: { year },
    include: { item: { select: { code: true, name: true, baseUnit: true } } },
    orderBy: { item: { sortOrder: "asc" } },
  });
  if (contracts.length === 0) return [];

  const receiptGroups = await prisma.chemicalReceipt.groupBy({
    by: ["itemId"],
    where: {
      itemId: { in: contracts.map((c) => c.itemId) },
      periodKey: { startsWith: `${year}-` },
    },
    _sum: { acceptedWeight: true },
  });
  const receivedByItem = new Map(receiptGroups.map((g) => [g.itemId, toNumber(g._sum.acceptedWeight) ?? 0]));

  return contracts.map((c) => {
    const contractQuantity = toNumber(c.contractQuantity) ?? 0;
    const forecastDemand = toNumber(c.forecastDemand) ?? 0;
    const received = receivedByItem.get(c.itemId) ?? 0;
    const remaining = calculateContractRemaining(contractQuantity, received);
    return {
      id: c.id,
      year: c.year,
      itemId: c.itemId,
      itemCode: c.item.code,
      itemName: c.item.name,
      baseUnit: c.item.baseUnit as BaseUnit,
      materialCode: c.materialCode,
      supplier: c.supplier,
      origin: c.origin,
      contractQuantity,
      forecastDemand,
      received,
      remaining,
      shortfall: calculateContractShortfall(forecastDemand, remaining),
      surplus: calculateContractSurplus(forecastDemand, remaining),
      progress: calculateContractProgress(contractQuantity, received),
      note: c.note,
    };
  });
}

// ---------------------------------------------------------------------------
// Danh mục & kỳ (dùng cho bộ lọc trên giao diện)
// ---------------------------------------------------------------------------

export async function listItems(prisma: PrismaClient) {
  const items = await prisma.chemicalInventoryItem.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return items.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    itemType: item.itemType,
    baseUnit: item.baseUnit,
    displayUnit: item.displayUnit,
    trackingMode: item.trackingMode,
    materialCode: item.materialCode,
    defaultPosition: item.defaultPosition,
    tankCapacity: toNumber(item.tankCapacity),
    lowStockThreshold: toNumber(item.lowStockThreshold),
  }));
}

export async function listPeriods(prisma: PrismaClient) {
  const periods = await prisma.chemicalInventoryPeriod.findMany({ orderBy: { periodKey: "desc" } });
  return periods.map((p) => ({
    periodKey: p.periodKey,
    status: p.status,
    isSeed: p.isSeed,
    generationMwh: toNumber(p.generationMwh),
    lockedAt: p.lockedAt?.toISOString() ?? null,
    note: p.note,
  }));
}

/** Quy đổi sang đơn vị hiển thị, dùng chung cho nhật ký ngày. */
export function toDisplayUnit(value: number | null, baseUnit: BaseUnit, displayUnit: BaseUnit | null) {
  if (value === null || !displayUnit || displayUnit === baseUnit) return value;
  return convertUnit(value, baseUnit, displayUnit);
}

export const UNASSIGNED_POSITION_CODE = UNASSIGNED_POSITION;
