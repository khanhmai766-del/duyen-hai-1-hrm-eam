/** Trạng thái ẩn cục bộ; không đồng nghĩa với hủy hoặc xác nhận sửa chữa. */
export const HIDDEN_DEFECT_SYNC_STATE = "HIDDEN";

export function canHideMissingDefect(defect: {
  sourceType: string;
  syncState: string;
  cancelledAt: unknown;
  pendingHistory: unknown;
}) {
  return defect.sourceType === "GOOGLE_SHEETS"
    && defect.syncState === "MISSING"
    && !defect.cancelledAt
    && !defect.pendingHistory;
}
