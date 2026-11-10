import type { QueryClient } from "@tanstack/react-query";

/** Các màn hình cùng đọc một thiết bị phải được làm mới cùng nhau. */
export function invalidateEquipmentQueries(qc: QueryClient, structureChanged = false, retiredDeviceId?: string) {
  const related = structureChanged ? ["repair-history", "defects", "defect-history", "materials", "replacements", "replacement-history", "position-system-scopes"] : [];
  const pending = ["devices", "device", "equipment-tree", "equipment-node", "device-qr-cards", "equipment-access", "material-ticket-options", ...related]
    .map(key => qc.invalidateQueries({ queryKey: [key],
      predicate: query => key !== "device" || !retiredDeviceId || query.queryKey[1] !== retiredDeviceId }));
  // Trang sắp chuyển sang mã mới: đánh dấu mã cũ hết hạn nhưng không gọi lại mã đã mất.
  if (retiredDeviceId) pending.push(qc.invalidateQueries({ queryKey: ["device", retiredDeviceId], refetchType: "none" }));
  return Promise.all(pending);
}
