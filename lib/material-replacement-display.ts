type ReplacementPointDisplay = {
  id?: string;
  deviceSeq?: string | null;
  location?: string | null;
  system?: string | null;
  device?: { name?: string | null } | null;
};

/**
 * Điểm đã gắn cây thiết bị luôn dùng deviceSeq làm định danh ổn định.
 * `location` chỉ dành cho điểm nhập tay không có deviceSeq.
 */
export function replacementPointSelectionKey(point: ReplacementPointDisplay & { id: string }) {
  return point.deviceSeq || `manual:${point.id}`;
}

/**
 * Với điểm gắn cây, tên EquipmentNode hiện tại là nguồn chuẩn để việc đổi tên
 * thiết bị tự phản ánh vào các form mới. Tên nhập tay chỉ dùng khi không gắn cây.
 */
export function replacementPointDisplayLabel(point: ReplacementPointDisplay) {
  if (point.deviceSeq) {
    return point.device?.name || point.location || point.system || point.deviceSeq;
  }
  return point.location || point.system || "Thiết bị nhập tay";
}
