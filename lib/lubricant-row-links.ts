/**
 * Quyết định liên kết tay của dòng Excel ở trang Theo dõi dầu mỡ (bảng LubricantRowLink).
 * Ghi đè các liên kết đã xác minh trong JSON (lubricant-verified-links / lubricant-link-decisions).
 *   point = gắn đúng điểm replacementId · excel = giữ theo Excel · none = bỏ liên kết (chưa liên kết).
 */
export type RowLinkMode = "point" | "excel" | "none";

export type RowLinkOverride = {
  sourceKey: string;
  replacementId: string | null;
  mode: RowLinkMode;
  updatedByName: string;
  updatedAt: string;
};

export const isRowLinkMode = (value: unknown): value is RowLinkMode =>
  value === "point" || value === "excel" || value === "none";

export type ResolvedRowLink<P> = {
  points: P[];
  /** true: dòng giữ nguyên theo Excel (JSON hoặc quyết định tay). */
  excelOnly: boolean;
  /** Quyết định tay đang có hiệu lực (để hiện dấu "liên kết tay"). */
  manual?: RowLinkOverride;
};

/**
 * Ghép điểm cho một dòng Excel: quyết định tay thắng liên kết tự động.
 * Điểm đã bị xoá/không còn hoạt động thì quyết định `point` không còn hiệu lực
 * và dòng quay về kết quả tự động.
 */
export function resolveRowLink<P extends { id: string }>(
  autoPoints: P[],
  autoExcelOnly: boolean,
  override: RowLinkOverride | undefined,
  pointsById: ReadonlyMap<string, P>,
): ResolvedRowLink<P> {
  if (!override) return { points: autoPoints, excelOnly: autoExcelOnly };
  if (override.mode === "excel") return { points: [], excelOnly: true, manual: override };
  if (override.mode === "none") return { points: [], excelOnly: false, manual: override };
  const point = override.replacementId ? pointsById.get(override.replacementId) : undefined;
  return point
    ? { points: [point], excelOnly: false, manual: override }
    : { points: autoPoints, excelOnly: autoExcelOnly };
}
