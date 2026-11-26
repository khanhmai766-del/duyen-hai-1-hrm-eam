/** Quyền nhóm "Nhập thông số độ rung" (menu Quản lý thiết bị). Mức bất kỳ khác "Không" ở view = được xem;
 *  entry cần từ "Cá nhân" trở lên; manage cần "Quản lý" trở lên. v1 chưa giới hạn theo cương vị/khu vực. */
export const VIBRATION_PERMISSION_ROWS = [{
  id: "vibration-view", group: "Độ rung thiết bị", feature: "Xem số đo độ rung",
  note: "Hiện mục “Nhập thông số độ rung” trong menu, cho mở các trang và xem số đo, lịch sử đo độ rung trong thẻ thiết bị.",
  matrix: { ADMIN: "full", MANAGER: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" } as const,
}, {
  id: "vibration-entry", group: "Độ rung thiết bị", feature: "Nhập / sửa số đo độ rung",
  note: "Cho phép lưu số đo ở các màn Theo kỳ, Mill theo ca, MNK theo ca, TBNT theo ca. Mức Cá nhân trở lên đều cho nhập; Không = chỉ xem.",
  matrix: { ADMIN: "full", MANAGER: "personal", SUPERVISOR: "personal", TECHNICIAN: "personal", VIEWER: "none" } as const,
}, {
  id: "vibration-manage", group: "Độ rung thiết bị", feature: "Quản lý danh mục & ánh xạ độ rung",
  note: "Ánh xạ thiết bị độ rung với cây thiết bị, chạy ánh xạ tự động, sửa danh mục thiết bị đo. Cần mức Quản lý hoặc Toàn quyền.",
  matrix: { ADMIN: "full", MANAGER: "manage", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" } as const,
}];

export const VIBRATION_DEFAULT_MATRIX = Object.fromEntries(VIBRATION_PERMISSION_ROWS.map(row => [row.id, row.matrix]));
export const VIBRATION_VIEW_LEVELS = ["read", "personal", "manage", "full"] as const;
export const VIBRATION_ENTRY_LEVELS = ["personal", "manage", "full"] as const;
export const VIBRATION_MANAGE_LEVELS = ["manage", "full"] as const;
