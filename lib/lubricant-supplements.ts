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
function vnDay(value: Date | string) {
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
