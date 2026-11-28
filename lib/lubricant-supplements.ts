/**
 * Lần bổ sung dầu mỡ gần nhất của từng điểm theo dõi.
 *
 * Nguồn: dòng lịch sử thay thế (MaterialReplacementLog) sinh từ phiếu vật tư có lý do
 * "Bổ sung". Dòng lưu trữ nhập từ Google Sheet không gắn thiết bị/điểm nên không dùng.
 */
export type SupplementLog = {
  replacementId: string | null;
  deviceSeq: string | null;
  machine: string | null;
  materialId: string | null;
  replacedAt: Date | string;
  usedQuantity: number | null;
  quantity: number | null;
  unitLabel: string | null;
};

export type SupplementInfo = { date: string; quantity: number | null; unit: string | null };

export const supplementIdKey = (replacementId: string) => `id:${replacementId}`;
export const supplementDeviceKey = (deviceSeq: string, machine: string, materialId: string) =>
  `dev:${deviceSeq}|${machine}|${materialId}`;

/** Ngày theo giờ Việt Nam (UTC+7), dạng YYYY-MM-DD. */
export function vnDay(value: Date | string) {
  return new Date(new Date(value).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Mỗi khoá (điểm hoặc thiết bị+tổ máy+vật tư) giữ ngày bổ sung mới nhất; các dòng
 * cùng ngày đó được cộng dồn khối lượng (một đợt bổ sung có thể chia nhiều dòng).
 */
export function latestSupplements(logs: SupplementLog[]): Record<string, SupplementInfo> {
  const result: Record<string, SupplementInfo> = {};
  for (const log of logs) {
    const keys = [
      log.replacementId && supplementIdKey(log.replacementId),
      log.deviceSeq && log.machine && log.materialId && supplementDeviceKey(log.deviceSeq, log.machine, log.materialId),
    ].filter((key): key is string => !!key);
    const date = vnDay(log.replacedAt);
    const quantity = log.usedQuantity ?? log.quantity;
    for (const key of keys) {
      const current = result[key];
      if (!current || date > current.date) {
        result[key] = { date, quantity, unit: log.unitLabel };
      } else if (date === current.date && quantity != null) {
        result[key] = { ...current, quantity: Math.round(((current.quantity ?? 0) + quantity) * 100) / 100 };
      }
    }
  }
  return result;
}

/**
 * Lần bổ sung gần nhất của một điểm: theo id điểm, hoặc theo thiết bị + tổ máy + vật tư
 * (loại chính HOẶC bất kỳ dầu thay thế nào của điểm). Lấy ngày mới nhất trong các khoá khớp.
 */
export function findPointSupplement(
  point: { id: string; deviceSeq: string | null; machine: string; materialId: string; alternateMaterialIds?: string[] | null },
  data: Record<string, SupplementInfo> | undefined,
): SupplementInfo | undefined {
  if (!data) return undefined;
  const keys = [supplementIdKey(point.id)];
  if (point.deviceSeq) {
    for (const materialId of [point.materialId, ...(point.alternateMaterialIds ?? [])]) {
      keys.push(supplementDeviceKey(point.deviceSeq, point.machine, materialId));
    }
  }
  return keys.map((key) => data[key]).filter((info): info is SupplementInfo => !!info)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
}

/** Ngày VN YYYY-MM-DD → thời điểm lưu DB (0h giờ VN, nên vnDay() trả lại đúng ngày đó). */
export const supplementDayToDate = (day: string) => new Date(`${day}T00:00:00+07:00`);

/** Lần bổ sung nhập tay (LubricantSupplement) → dạng log để gộp chung vào latestSupplements(). */
export function manualSupplementLogs(
  rows: { replacementId: string; suppliedAt: Date | string; quantity: number | null; unit: string | null }[],
): SupplementLog[] {
  return rows.map((row) => ({
    replacementId: row.replacementId, deviceSeq: null, machine: null, materialId: null,
    replacedAt: row.suppliedAt, usedQuantity: row.quantity, quantity: null, unitLabel: row.unit,
  }));
}

export type SupplementHistoryItem = {
  id: string;
  source: "manual" | "ticket";
  sourceLabel: string;
  date: string;
  quantity: number | null;
  unit: string | null;
  materialName: string | null;
  note: string | null;
  byName: string | null;
  deletable: boolean;
};

/** Mới nhất trước; cùng ngày thì nhập tay xếp trước phiếu. */
export function sortSupplementHistory(items: SupplementHistoryItem[]) {
  return [...items].sort((a, b) => (a.date === b.date ? (a.source === b.source ? 0 : a.source === "manual" ? -1 : 1) : a.date < b.date ? 1 : -1));
}
