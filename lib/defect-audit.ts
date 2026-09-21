/**
 * Action nhật ký ghi khi website chuyển phiếu sang Đã xử lý (xem lib/defect-resolved-audit.ts).
 * Báo cáo tuần đếm "Đã xử lý trong tuần" theo action này.
 */
export const DEFECT_RESOLVED_AUDIT_ACTION = "DEFECT_RESOLVED";

type DefectAuditReference = {
  requestType?: string | null;
  requestNumber?: string | null;
};

/** Tạo mô tả nhận diện phiếu thống nhất để nhật ký dễ đọc và tìm kiếm. */
export function defectAuditReference(
  actionLabel: string,
  defect: DefectAuditReference
) {
  return [
    `${actionLabel} loại ${defect.requestType || "chưa xác định"}`,
    `Số phiếu: ${defect.requestNumber || "chưa có"}`,
  ].join(" · ");
}
