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
