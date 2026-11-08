export const ROLES = ["admin", "supervisor", "technician", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Quản trị",
  supervisor: "Trưởng ca / Giám sát",
  technician: "Kỹ thuật viên",
  editor: "Nhập liệu",
  viewer: "Chỉ xem",
};

export const PERMISSIONS = [
  "manage_users",
  "manage_permissions",
  "backup_data",
  "restore_data",
  "view_data_history",
  "edit_monthly_kpi",
  "edit_daily_inputs",
  "edit_ppa",
  "edit_pmis",
  "edit_bcsx",
  "edit_water",
  "sync_qlkt",
  "sync_google_sheet",
  "view_all",
  "edit_ctktkt",
  "edit_chemical",
  "ctktkt_kpi_summary",
  "ctktkt_tkd_trend",
  "ctktkt_tpd_tcd_power",
  "ctktkt_lo_pho_oil",
  "ctktkt_may_nghien_coal_s1",
  "ctktkt_may_nghien_coal_s2",
  "ctktkt_steam_flow",
  "ctktkt_nh3_tank",
  "ctktkt_nh3_dcs",
  "ctktkt_td21",
  "ctktkt_startup_shutdown",
  "ctktkt_coal_blend_pmis",
  "ctktkt_pmis_reports",
  "ctktkt_other_fields",
  "water_meta",
  "water_electricity",
  "water_water_intake",
  "water_resin_water",
  "chemical_PAC_LIQUID",
  "chemical_NAOCL",
  "chemical_NH4OH_20",
  "chemical_HCL_31",
  "chemical_NAOH_31",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  manage_users: "Quản trị hệ thống & Phân quyền",
  manage_permissions: "Cấu hình phân quyền KTKT",
  backup_data: "Tải bản sao lưu dữ liệu",
  restore_data: "Nạp dữ liệu từ bản sao lưu",
  view_data_history: "Xem nhật ký số liệu",
  edit_monthly_kpi: "Nhập chỉ tiêu KTKT tháng (7 chỉ tiêu)",
  edit_daily_inputs: "Nhập số liệu sản xuất ngày",
  edit_ppa: "Quản lý Suất hao nhiệt PPA",
  edit_pmis: "Quản lý Báo cáo PMIS (Tổn thất khói)",
  edit_bcsx: "Nhập liệu & Xuất báo cáo BCSX (48 điểm)",
  edit_water: "Quản lý theo dõi lượng nước theo ca",
  sync_qlkt: "Đồng bộ tự động từ QLKT",
  sync_google_sheet: "Đồng bộ dữ liệu Google Sheet",
  view_all: "Xem toàn bộ báo cáo & dữ liệu",
  edit_ctktkt: "Nhập toàn bộ Báo cáo Chỉ tiêu KTKT",
  edit_chemical: "Nhập toàn bộ hóa chất",
  ctktkt_kpi_summary: "Chỉ tiêu KTKT tổng hợp",
  ctktkt_tkd_trend: "Bảng TKĐ trend DCS",
  ctktkt_tpd_tcd_power: "Công tơ điện Tổ máy (S1 & S2)",
  ctktkt_lo_pho_oil: "Công tơ dầu cấp / về bồn (F1 - F2)",
  ctktkt_may_nghien_coal_s1: "Công tơ than Tổ máy S1 (12 cân A1..F2)",
  ctktkt_may_nghien_coal_s2: "Công tơ than Tổ máy S2 (12 cân A1..F2)",
  ctktkt_steam_flow: "Lưu lượng hơi (S1 & S2)",
  ctktkt_nh3_tank: "Tổng lượng NH3 dùng trong ngày",
  ctktkt_nh3_dcs: "Tổng lượng NH3 dùng trong ngày theo công tơ DCS",
  ctktkt_td21: "Công tơ điện tự dùng - TD21",
  ctktkt_startup_shutdown: "Khởi động / Ngừng tổ máy",
  ctktkt_coal_blend_pmis: "Bảng nhập PMIS than trộn 6A10 & Sub bitum",
  ctktkt_pmis_reports: "Báo cáo PMIS 02-PĐ & Đối chiếu ngày",
  ctktkt_other_fields: "Các ô bổ sung ngoài nhóm",
  water_meta: "Ngày, ca, kíp",
  water_electricity: "Công tơ điện",
  water_water_intake: "Nước nhận ca / bình ngưng",
  water_resin_water: "Nước tái sinh hạt",
  chemical_PAC_LIQUID: "PAC lỏng",
  chemical_NAOCL: "NaOCl",
  chemical_NH4OH_20: "NH4OH 20%",
  chemical_HCL_31: "HCl 31%",
  chemical_NAOH_31: "NaOH 31%",

};

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  position?: string;
  employeeCode?: string;
  permissions: Permission[];
  /** Được cấp quyền RBAC "ctktkt-delegate": mở trang Phân công nhập liệu KTKT. */
  canDelegateInputs?: boolean;
  /** Set when the account still uses a temporary or weak password; only password change is allowed. */
  mustChangePassword?: boolean;
};

export function isAdminUser(user: SessionUser | null | undefined): boolean {
  return Boolean(user && (user.role === "admin" || user.permissions?.includes("manage_users")));
}

const PRE_ADJUSTMENT_HEAT_RATE_POSITIONS = new Set([
  "trưởng kíp điện",
  "tk lò máy",
  "trưởng kíp lò - máy",
  "trưởng kíp lò máy",
  "trưởng ca",
  "kỹ thuật viên",
  "lãnh đạo phân xưởng",
]);

export function canViewPreAdjustmentHeatRate(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  return PRE_ADJUSTMENT_HEAT_RATE_POSITIONS.has((user.position || "").trim().toLocaleLowerCase("vi-VN"));
}

export function hasPermission(user: SessionUser | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  if (permission === "view_all") return true;
  return user.permissions?.includes(permission) ?? false;
}
