export type RbacLevel = "none" | "read" | "personal" | "manage" | "full";

export const DEFAULT_RBAC_MATRIX: Record<string, Partial<Record<string, RbacLevel>>> = {
  "shift-operation-check-in": { ADMIN: "personal", MANAGER: "personal", SUPERVISOR: "personal", TECHNICIAN: "personal", VIEWER: "read" },
  "shift-operation-approve": { ADMIN: "manage", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "none", VIEWER: "none" },
  "hc-attendance-group-create": { ADMIN: "personal", MANAGER: "personal", SUPERVISOR: "personal", TECHNICIAN: "personal", VIEWER: "none" },
  "hc-attendance-check-in": { ADMIN: "personal", MANAGER: "personal", SUPERVISOR: "personal", TECHNICIAN: "personal", VIEWER: "read" },
  "hc-attendance-approve": { ADMIN: "manage", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "none", VIEWER: "none" },
  "timesheet-edit": { ADMIN: "manage", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "none", VIEWER: "none" },
  "user-manage": { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  "user-reset-viewer-password": { ADMIN: "manage", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  "rbac-manage": { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  "system_audit_log:view": { ADMIN: "read", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  "broadcast-manage": { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  "device-view": { ADMIN: "full", MANAGER: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  "device-manage": { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  "device-delete": { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  "repair-create": { ADMIN: "personal", MANAGER: "personal", SUPERVISOR: "personal", TECHNICIAN: "personal", VIEWER: "none" },
  "repair-edit": { ADMIN: "manage", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "personal", VIEWER: "none" },
  "repair-delete": { ADMIN: "full", MANAGER: "personal", SUPERVISOR: "personal", TECHNICIAN: "personal", VIEWER: "none" },
  "repair-approve": { ADMIN: "manage", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "none", VIEWER: "none" },
  "defect-manage": { ADMIN: "manage", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "personal", VIEWER: "read" },
  // Phạm vi XEM khiếm khuyết. Tách hẳn khỏi quyền SỬA: `defect-manage` bị quy về
  // `repair-edit` và trên thực tế đã mở mức "manage" cho mọi vai trò, nên nếu để quyền
  // xem đi ké quyền sửa thì rào cương vị không bao giờ có hiệu lực.
  // Đọc/Cá nhân = chỉ cương vị của mình (và cấp dưới theo sơ đồ ca trực);
  // Quản lý/Toàn quyền = toàn phân xưởng.
  "defect-view": { ADMIN: "full", MANAGER: "full", SUPERVISOR: "manage", TECHNICIAN: "read", VIEWER: "read" },
  "defect-close": { ADMIN: "full", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "none", VIEWER: "none" },
  "defect-delete": { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  "defect-history-delete": { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  "defect-two-way-sync": { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  "material-manage": { ADMIN: "full", MANAGER: "full", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  "replacement-manage": { ADMIN: "full", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "read", VIEWER: "read" },
  "announcement-manage": { ADMIN: "full", MANAGER: "full", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  "operation-events": { ADMIN: "manage", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "read", VIEWER: "read" },
  "device-code": { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  "device-public-qr": { ADMIN: "read", MANAGER: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  "document-procedure": { ADMIN: "full", MANAGER: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  "document-pid": { ADMIN: "full", MANAGER: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  "archive-read": { ADMIN: "read", MANAGER: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  "archive-create-delete": { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  "archive-edit": { ADMIN: "manage", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "manage", VIEWER: "read" },
  "archive-backup": { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  "archive-grid-separation": { ADMIN: "full", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "manage", VIEWER: "read" },
  "archive-startup-data": { ADMIN: "full", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "manage", VIEWER: "read" },
  "archive-boiler-calibration": { ADMIN: "full", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "manage", VIEWER: "read" },
  "archive-major-repair": { ADMIN: "full", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "manage", VIEWER: "read" },
  "archive-oil-gun-data": { ADMIN: "full", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "manage", VIEWER: "read" },
  "archive-soot-blower-data": { ADMIN: "full", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "manage", VIEWER: "read" },
  // PCCC: xem thì mở cho mọi vai trò (báo cáo an toàn), nhập/ký giới hạn ở cấp
  // trực tiếp quản lý thiết bị; chốt kỳ chỉ quản lý trở lên.
  "pccc-view": { ADMIN: "full", MANAGER: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" },
  "pccc-manage": { ADMIN: "full", MANAGER: "manage", SUPERVISOR: "manage", TECHNICIAN: "personal", VIEWER: "none" },
  "pccc-close-period": { ADMIN: "full", MANAGER: "manage", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
  "forum-write": { ADMIN: "personal", MANAGER: "personal", SUPERVISOR: "personal", TECHNICIAN: "personal", VIEWER: "personal" },
  "forum-moderate": { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" },
};
