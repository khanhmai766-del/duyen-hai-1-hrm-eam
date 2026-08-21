import {
  RECONCILE_EPSILON,
  TRUCK_WEIGHT_RANGE_TON,
  USAGE_OUTLIER_RATIO,
  type BaseUnit,
  type WarningCode,
} from "./constants";

/**
 * Toàn bộ phép tính của sổ tồn kho hóa chất.
 *
 * CỐ Ý không import Prisma và không đụng DB: các hàm ở đây thuần, gọi được từ
 * script kiểm chứng lẫn từ giao diện, và là chỗ duy nhất định nghĩa "thế nào là
 * đúng". Repo chưa có test runner nên tính thuần là cách rẻ nhất để kiểm được.
 *
 * Quy ước xuyên suốt: `null` nghĩa là CHƯA CÓ SỐ, khác hẳn `0` là đã đo và bằng 0.
 * Không hàm nào được phép âm thầm biến `null` thành `0`.
 */

/** Cộng, bỏ qua null. Trả `null` nếu không có giá trị nào — không trả 0. */
function sumPresent(values: ReadonlyArray<number | null | undefined>): number | null {
  const present = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0);
}

/** Làm tròn về 4 số lẻ đúng bằng độ chính xác của cột DECIMAL(18,4). */
export function roundToStorage(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** Hai số coi là bằng nhau khi lệch dưới ngưỡng đối soát. */
export function nearlyEqual(a: number, b: number, epsilon = RECONCILE_EPSILON): boolean {
  return Math.abs(a - b) < epsilon;
}

// ---------------------------------------------------------------------------
// Phiếu nhập
// ---------------------------------------------------------------------------

export type AcceptedWeightResult = {
  /** Khối lượng được công nhận, hoặc null nếu không có số cân nào. */
  value: number | null;
  warnings: WarningCode[];
};

/**
 * Khối lượng được công nhận = số cân NHỎ HƠN giữa nhà máy và nhà thầu.
 *
 * Sheet gốc dùng đúng công thức này (`=IF(C>D,D,C)`) nhưng nhiều ô đã bị sửa tay,
 * nên backend luôn tính lại thay vì tin giá trị sẵn có.
 *
 * Chỉ có một số cân thì lấy chính nó, kèm cảnh báo — giao diện sẽ bắt ghi chú.
 */
export function calculateAcceptedWeight(
  plantWeight: number | null | undefined,
  contractorWeight: number | null | undefined
): AcceptedWeightResult {
  const plant = Number.isFinite(plantWeight as number) ? (plantWeight as number) : null;
  const contractor = Number.isFinite(contractorWeight as number) ? (contractorWeight as number) : null;

  if (plant !== null && contractor !== null) {
    return { value: roundToStorage(Math.min(plant, contractor)), warnings: [] };
  }
  if (plant !== null) return { value: roundToStorage(plant), warnings: ["MISSING_WEIGHT"] };
  if (contractor !== null) return { value: roundToStorage(contractor), warnings: ["MISSING_WEIGHT"] };
  return { value: null, warnings: ["MISSING_WEIGHT"] };
}

/** Tổng khối lượng công nhận của một tập phiếu nhập. */
export function calculateReceivedTotal(
  receipts: ReadonlyArray<{ acceptedWeight: number | null }>
): number | null {
  return sumPresent(receipts.map((r) => r.acceptedWeight));
}

// ---------------------------------------------------------------------------
// Tồn kho tháng
// ---------------------------------------------------------------------------

/**
 * Tổng tồn cuối kỳ = cộng các cương vị.
 *
 * Ô trống bị BỎ QUA. Trả `null` khi chưa cương vị nào có số — nếu trả 0 thì lượng
 * sử dụng sẽ vọt lên bằng đúng tồn đầu, tạo ra một con số sai trông rất thật.
 */
export function calculateClosingTotal(
  quantities: ReadonlyArray<number | null | undefined>
): number | null {
  const total = sumPresent(quantities);
  return total === null ? null : roundToStorage(total);
}

/** Tồn đầu kỳ chính là tồn cuối kỳ liền trước. Không bao giờ nhập tay. */
export function calculateOpeningBalance(previousClosingTotal: number | null): number | null {
  return previousClosingTotal;
}

/**
 * Lượng sử dụng = tồn đầu + nhập trong kỳ − tồn cuối.
 *
 * CÓ THỂ ÂM và phải giữ nguyên giá trị âm. Với các bồn nhiên liệu, sheet không
 * theo dõi lượng bơm vào bồn (`received` luôn bằng 0) nên cứ mỗi lần nạp dầu là
 * kết quả ra âm — đó là đặc điểm của sổ gốc, không phải lỗi tính. Kẹp về 0 là
 * che mất chỗ cần đối soát.
 *
 * Thiếu tồn đầu hoặc tồn cuối thì trả `null` chứ không đoán.
 */
export function calculateConsumedTotal(
  opening: number | null,
  received: number | null,
  closing: number | null
): number | null {
  if (opening === null || closing === null) return null;
  return roundToStorage(opening + (received ?? 0) - closing);
}

// ---------------------------------------------------------------------------
// Nhật ký ngày (hiện chỉ NH3)
// ---------------------------------------------------------------------------

/** Lượng dùng trong ngày = tồn 00h + nhập trong ngày − tồn 24h. Có thể âm. */
export function calculateDailyUsed(
  openingStock: number | null,
  importedToday: number | null,
  closingStock: number | null
): number | null {
  if (openingStock === null || closingStock === null) return null;
  return roundToStorage(openingStock + (importedToday ?? 0) - closingStock);
}

/** Trung vị các lượng dùng dương trong tháng — mốc so sánh để phát hiện ngày bất thường. */
export function medianUsage(values: ReadonlyArray<number | null>): number | null {
  const positives = values
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (positives.length === 0) return null;
  const mid = Math.floor(positives.length / 2);
  return positives.length % 2 === 0
    ? (positives[mid - 1] + positives[mid]) / 2
    : positives[mid];
}

/**
 * Suất hao đầu cực (kg/MWh) = tổng hóa chất đã dùng ÷ sản lượng điện S1+S2.
 * `usedQuantity` phải tính bằng kg; sản lượng bằng MWh.
 */
export function calculateSpecificConsumption(
  usedQuantityKg: number | null,
  generationMwh: number | null
): number | null {
  if (usedQuantityKg === null || generationMwh === null) return null;
  if (!(generationMwh > 0)) return null;
  return usedQuantityKg / generationMwh;
}

/** Còn đủ dùng bao nhiêu ngày ở mức tiêu thụ hiện tại. */
export function calculateDaysOfStock(
  closingStock: number | null,
  dailyUsage: number | null
): number | null {
  if (closingStock === null || dailyUsage === null) return null;
  if (!(dailyUsage > 0)) return null;
  return Math.floor(closingStock / dailyUsage);
}

// ---------------------------------------------------------------------------
// Hợp đồng
// ---------------------------------------------------------------------------

/**
 * Đã nhận theo hợp đồng — LUÔN cộng lại từ phiếu nhập.
 *
 * Sheet gốc có cột "Đã nhận" nhưng từ tháng 9 nó trỏ nhầm sang khối LƯỢNG SỬ DỤNG,
 * nên cột đó không được import và cũng không được dùng làm nguồn.
 */
export function calculateContractReceived(
  receipts: ReadonlyArray<{ acceptedWeight: number | null }>
): number {
  return roundToStorage(calculateReceivedTotal(receipts) ?? 0);
}

export function calculateContractRemaining(contractQuantity: number, received: number): number {
  return roundToStorage(contractQuantity - received);
}

/** Thiếu hụt so với nhu cầu dự kiến. Không bao giờ âm. */
export function calculateContractShortfall(forecastDemand: number, remaining: number): number {
  return roundToStorage(Math.max(0, forecastDemand - remaining));
}

/** Thặng dư so với nhu cầu dự kiến. Không bao giờ âm. */
export function calculateContractSurplus(forecastDemand: number, remaining: number): number {
  return roundToStorage(Math.max(0, remaining - forecastDemand));
}

/** Tỉ lệ đã nhận trên khối lượng hợp đồng, kẹp trong [0, 1] để vẽ thanh tiến độ. */
export function calculateContractProgress(contractQuantity: number, received: number): number {
  if (!(contractQuantity > 0)) return 0;
  return Math.min(1, Math.max(0, received / contractQuantity));
}

// ---------------------------------------------------------------------------
// Đơn vị
// ---------------------------------------------------------------------------

/**
 * Quy đổi đơn vị. CHỈ đổi được giữa KG và TON — lít là đại lượng khác, gộp vào là sai.
 * Đây là chỗ DUY NHẤT được phép quy đổi trong module.
 */
export function convertUnit(value: number, from: BaseUnit, to: BaseUnit): number {
  if (from === to) return value;
  if (from === "KG" && to === "TON") return value / 1000;
  if (from === "TON" && to === "KG") return value * 1000;
  throw new Error(`Không quy đổi được từ ${from} sang ${to} — hai đại lượng khác nhau`);
}

// ---------------------------------------------------------------------------
// Sinh cảnh báo
// ---------------------------------------------------------------------------

/** Cảnh báo cho một chuyến xe. `weightTon` là khối lượng đã quy về tấn. */
export function inspectTruck(weightTon: number | null): WarningCode[] {
  if (weightTon === null || weightTon <= 0) return [];
  return weightTon < TRUCK_WEIGHT_RANGE_TON.min || weightTon > TRUCK_WEIGHT_RANGE_TON.max
    ? ["TRUCK_WEIGHT_OUTLIER"]
    : [];
}

/** Cảnh báo cho một ngày trong nhật ký. */
export function inspectDailyRow(input: {
  openingStock: number | null;
  closingStock: number | null;
  previousClosingStock: number | null;
  used: number | null;
  monthMedianUsage: number | null;
  tankCapacity: number | null;
  lowStockThreshold: number | null;
}): WarningCode[] {
  const out: WarningCode[] = [];
  const { openingStock, closingStock, previousClosingStock, used, monthMedianUsage } = input;

  if (used !== null && used < 0) out.push("NEGATIVE_CONSUMED");

  if (openingStock !== null && previousClosingStock !== null && !nearlyEqual(openingStock, previousClosingStock)) {
    out.push("CHAIN_BREAK");
  }

  if (closingStock !== null) {
    if (closingStock < 0) out.push("NEGATIVE_CLOSING");
    if (input.tankCapacity !== null && closingStock > input.tankCapacity) out.push("OVER_CAPACITY");
    if (input.lowStockThreshold !== null && closingStock > 0 && closingStock < input.lowStockThreshold) {
      out.push("LOW_STOCK");
    }
  }

  if (used !== null && used > 0 && monthMedianUsage !== null && monthMedianUsage > 0) {
    const ratio = used / monthMedianUsage;
    if (ratio > USAGE_OUTLIER_RATIO.high || ratio < USAGE_OUTLIER_RATIO.low) out.push("USAGE_OUTLIER");
  }

  return out;
}

/** Cảnh báo cho một dòng mặt hàng trên lưới tồn kho tháng. */
export function inspectMonthlyRow(input: {
  openingTotal: number | null;
  previousClosingTotal: number | null;
  closingTotal: number | null;
  consumedTotal: number | null;
  hasReceipts: boolean;
  hasPeriod: boolean;
}): WarningCode[] {
  const out: WarningCode[] = [];

  if (
    input.openingTotal !== null &&
    input.previousClosingTotal !== null &&
    !nearlyEqual(input.openingTotal, input.previousClosingTotal)
  ) {
    out.push("OPENING_MISMATCH");
  }
  if (input.closingTotal !== null && input.closingTotal < 0) out.push("NEGATIVE_CLOSING");
  if (input.consumedTotal !== null && input.consumedTotal < 0) out.push("NEGATIVE_CONSUMED");
  if (input.hasReceipts && !input.hasPeriod) out.push("RECEIPT_WITHOUT_PERIOD");

  return out;
}
