/** Điều kiện dùng chung cho API và nút quản trị; không cho lùi hồ sơ đã phát hành. */
export function usageUndoError(t: {
  type: string; status: string; usedAt: Date | string | null; usedQuantity: number | null;
  completedAt: Date | string | null; settledAt: Date | string | null;
  docUrl: string | null; bbktDocUrl: string | null; recoveryDocUrl: string | null;
  recoveryDocNo?: number | null; bbntDoNumber: string | null;
  recoveryDocSentAt: Date | string | null; recoveryDocSignedAt: Date | string | null;
}) {
  if (!["DE_XUAT", "UNG", "SU_DUNG_HIEN_CO"].includes(t.type)
    || !["CHO_NGHIEM_THU", "SU_DUNG_VAT_TU"].includes(t.status)
    || !t.usedAt || t.usedQuantity == null || t.usedQuantity <= 0) {
    return "Phiếu không có bước sử dụng vật tư có thể hủy";
  }
  if (t.completedAt || t.settledAt || t.docUrl || t.bbktDocUrl || t.recoveryDocUrl
    || t.recoveryDocNo != null || t.bbntDoNumber || t.recoveryDocSentAt || t.recoveryDocSignedAt) {
    return "Phiếu đã nghiệm thu hoặc phát sinh hồ sơ, không thể hủy ghi nhận sử dụng";
  }
  return null;
}
