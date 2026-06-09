// Centralized domain constants: statuses, roles, shift types, and their UI metadata.

export const DEVICE_STATUS = {
  NORMAL: { label: "Bình thường", badge: "bg-green-100 text-green-800", dot: "#16A34A" },
  MAINTENANCE: { label: "Bảo trì", badge: "bg-amber-100 text-amber-800", dot: "#D97706" },
  FAULT: { label: "Sự cố", badge: "bg-red-100 text-red-800", dot: "#DC2626" },
  UNDER_REPAIR: { label: "Đang sửa", badge: "bg-blue-100 text-blue-800", dot: "#2563EB" },
  DECOMMISSIONED: { label: "Ngừng hoạt động", badge: "bg-gray-100 text-gray-600", dot: "#6B7280" },
} as const;

export type DeviceStatusKey = keyof typeof DEVICE_STATUS;

export const DEVICE_STATUS_ORDER: DeviceStatusKey[] = [
  "NORMAL",
  "MAINTENANCE",
  "FAULT",
  "UNDER_REPAIR",
  "DECOMMISSIONED",
];

export const REPAIR_STATUS = {
  OPEN: { label: "Mở", badge: "bg-slate-100 text-slate-700", dot: "#64748B", step: 0 },
  IN_PROGRESS: { label: "Đang xử lý", badge: "bg-blue-100 text-blue-800", dot: "#2563EB", step: 1 },
  WAITING_PARTS: { label: "Chờ vật tư", badge: "bg-amber-100 text-amber-800", dot: "#D97706", step: 2 },
  RESOLVED: { label: "Đã khắc phục", badge: "bg-green-100 text-green-800", dot: "#16A34A", step: 3 },
  CLOSED: { label: "Đã đóng", badge: "bg-gray-100 text-gray-600", dot: "#6B7280", step: 4 },
} as const;

export type RepairStatusKey = keyof typeof REPAIR_STATUS;
export const REPAIR_STATUS_ORDER: RepairStatusKey[] = ["OPEN", "IN_PROGRESS", "WAITING_PARTS", "RESOLVED", "CLOSED"];

export const PRIORITY = {
  LOW: { label: "Thấp", badge: "bg-gray-100 text-gray-700" },
  MEDIUM: { label: "Trung bình", badge: "bg-blue-100 text-blue-800" },
  HIGH: { label: "Cao", badge: "bg-amber-100 text-amber-800" },
  CRITICAL: { label: "Nghiêm trọng", badge: "bg-red-100 text-red-800" },
} as const;

export type PriorityKey = keyof typeof PRIORITY;
export const PRIORITY_ORDER: PriorityKey[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export const ROLES = {
  ADMIN: { label: "Quản trị", badge: "bg-navy text-white" },
  SUPERVISOR: { label: "Trưởng ca", badge: "bg-accent text-white" },
  TECHNICIAN: { label: "Kỹ thuật viên", badge: "bg-secondary text-white" },
  VIEWER: { label: "Người xem", badge: "bg-gray-200 text-gray-700" },
} as const;

export type RoleKey = keyof typeof ROLES;

export const SHIFT_TYPE = {
  MORNING: { label: "Sáng", short: "V1", color: "#FDE68A", text: "#92400E" },
  AFTERNOON: { label: "Chiều", short: "V2", color: "#BFDBFE", text: "#1E40AF" },
  NIGHT: { label: "Đêm", short: "V3", color: "#C7D2FE", text: "#3730A3" },
} as const;

export type ShiftTypeKey = keyof typeof SHIFT_TYPE;
export const SHIFT_TYPE_ORDER: ShiftTypeKey[] = ["MORNING", "AFTERNOON", "NIGHT"];

/**
 * Real-time shift by clock:
 *  06:00–14:00 → Ca Sáng (MORNING)
 *  14:00–22:00 → Ca Chiều (AFTERNOON)
 *  22:00–06:00 → Ca Đêm (NIGHT)
 */
export function currentShiftType(d: Date = new Date()): ShiftTypeKey {
  const h = d.getHours();
  if (h >= 6 && h < 14) return "MORNING";
  if (h >= 14 && h < 22) return "AFTERNOON";
  return "NIGHT";
}

/**
 * The shift currently in progress + the calendar date it belongs to. The night
 * shift crosses midnight, so 00:00–05:59 maps to the PREVIOUS day's night shift.
 */
export function realtimeShift(now: Date = new Date()): { date: string; shiftType: ShiftTypeKey } {
  const h = now.getHours();
  const d = new Date(now);
  let shiftType: ShiftTypeKey;
  if (h >= 6 && h < 14) shiftType = "MORNING";
  else if (h >= 14 && h < 22) shiftType = "AFTERNOON";
  else {
    shiftType = "NIGHT";
    if (h < 6) d.setDate(d.getDate() - 1);
  }
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { date, shiftType };
}

/**
 * Khung giờ của một ca trực (start/end datetime) theo ngày + loại ca:
 *  Sáng  06:00–14:00 · Chiều 14:00–22:00 · Đêm 22:00 → 06:00 hôm sau.
 * Dùng để xác định ca đã kết thúc hay chưa (reset card cương vị, đếm ca sớm).
 */
export function shiftWindow(date: Date | string, shiftType: string): { start: Date; end: Date } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const at = (base: Date, h: number) => {
    const x = new Date(base);
    x.setHours(h, 0, 0, 0);
    return x;
  };
  if (shiftType === "MORNING") return { start: at(d, 6), end: at(d, 14) };
  if (shiftType === "AFTERNOON") return { start: at(d, 14), end: at(d, 22) };
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  return { start: at(d, 22), end: at(next, 6) };
}

/** Số ca trực được phép điểm danh sớm (đặt trước) tối đa cho mỗi user. */
export const MAX_EARLY_CHECKINS = 15;

export const OPERATION_TYPE = {
  DRILL_INCIDENT: { label: "Diễn tập sự cố", badge: "bg-amber-100 text-amber-800", dot: "#D97706" },
  DRILL_FIRE: { label: "Diễn tập PCCC", badge: "bg-red-100 text-red-800", dot: "#DC2626" },
  OTHER: { label: "Hoạt động khác", badge: "bg-blue-100 text-blue-800", dot: "#2563EB" },
} as const;

export type OperationTypeKey = keyof typeof OPERATION_TYPE;
export const OPERATION_TYPE_ORDER: OperationTypeKey[] = ["DRILL_INCIDENT", "DRILL_FIRE", "OTHER"];

export const CHECKIN_STATUS = {
  PRESENT: { label: "Có mặt", badge: "bg-green-100 text-green-800" },
  LATE: { label: "Đi muộn", badge: "bg-amber-100 text-amber-800" },
  ABSENT: { label: "Vắng", badge: "bg-red-100 text-red-800" },
} as const;

export const DEVICE_CATEGORIES = ["ESP", "FGD", "I&C", "Boiler", "Turbine"] as const;

// ---- Khiếm khuyết thiết bị (Defect) ----

export const DEFECT_UNITS = ["S1", "S2"] as const;

/** Mức độ khiếm khuyết (1–4). */
export const DEFECT_SEVERITY = {
  "1": "1 - Ảnh hưởng hệ số đáp ứng",
  "2": "2 - Ảnh hưởng công suất",
  "3": "3 - Hư hỏng xếp chồng, ảnh hưởng công suất",
  "4": "4 - Không hư hỏng xếp chồng, ảnh hưởng công suất",
} as const;
export const DEFECT_SEVERITY_ORDER = ["1", "2", "3", "4"] as const;

/** Điều kiện thực hiện. */
export const DEFECT_CONDITION = {
  A: "A - Cần ngừng máy",
  B: "B - Không cần ngừng",
} as const;
export const DEFECT_CONDITION_ORDER = ["A", "B"] as const;

/** Cương vị (chức vụ) cho khiếm khuyết. */
export const DEFECT_POSITIONS = [
  "Lò Trưởng",
  "Máy Trưởng",
  "Lò Phó",
  "Máy Nghiền",
  "Thải Xỉ",
  "ESP",
  "FGD",
  "Máy Phó",
  "Trợ Thủ",
  "Trạm Bơm Tuần Hoàn",
  "XLNT",
  "XLN Hỗn Hợp",
  "Khí Nén - Nhà Dầu",
  "NH3 - LHP",
  "Trực phụ điện",
  "Trực chính điện",
] as const;

/** Loại yêu cầu (chuyên môn). */
export const DEFECT_REQUEST_TYPES = ["Cơ", "Điện", "Hóa", "Hành Chính IT", "Khác"] as const;

/** Tình trạng khiếm khuyết. */
export const DEFECT_STATUS = {
  CHUA_XU_LY: { label: "Chưa xử lý", badge: "bg-slate-100 text-slate-700", dot: "#64748B" },
  CO_PCT: { label: "Đang có PCT thực hiện", badge: "bg-blue-100 text-blue-800", dot: "#2563EB" },
  CHO_VAT_TU: { label: "Chờ vật tư", badge: "bg-amber-100 text-amber-800", dot: "#D97706" },
  DA_XU_LY: { label: "Đã xử lý", badge: "bg-green-100 text-green-800", dot: "#16A34A" },
} as const;
export type DefectStatusKey = keyof typeof DEFECT_STATUS;
export const DEFECT_STATUS_ORDER: DefectStatusKey[] = ["CHUA_XU_LY", "CO_PCT", "CHO_VAT_TU", "DA_XU_LY"];

/** Hệ thống thiết bị nhà máy — dùng cho phân loại vật tư. */
export const MATERIAL_SYSTEMS = [
  "Lò Hơi",
  "Máy Nghiền",
  "Thải Xỉ",
  "ESP",
  "FGD",
  "Máy Phó",
  "Trợ Thủ",
  "Máy Nén Khí",
  "NH3 - Lò hơi phụ",
  "XLNT",
  "XLN Hỗn hợp",
] as const;

// ---- Bảo trì định kỳ (Preventive Maintenance) ----

/** Preset chu kỳ bảo trì thường gặp (ngày). */
export const MAINTENANCE_INTERVALS: { days: number; label: string }[] = [
  { days: 7, label: "Hàng tuần" },
  { days: 14, label: "2 tuần" },
  { days: 30, label: "Hàng tháng" },
  { days: 90, label: "Hàng quý" },
  { days: 180, label: "6 tháng" },
  { days: 365, label: "Hàng năm" },
];

export function intervalLabel(days: number): string {
  return MAINTENANCE_INTERVALS.find((i) => i.days === days)?.label ?? `${days} ngày`;
}

/**
 * Trạng thái đến hạn của một kế hoạch bảo trì, suy ra từ nextDueAt:
 *  OVERDUE  — đã quá hạn (nextDue < hôm nay)
 *  DUE_SOON — đến hạn trong ≤ 7 ngày tới
 *  OK       — còn xa hạn
 */
export const PM_DUE = {
  OVERDUE: { label: "Quá hạn", badge: "bg-red-100 text-red-800", dot: "#DC2626" },
  DUE_SOON: { label: "Sắp đến hạn", badge: "bg-amber-100 text-amber-800", dot: "#D97706" },
  OK: { label: "Đúng kế hoạch", badge: "bg-green-100 text-green-800", dot: "#16A34A" },
} as const;

export type PmDueKey = keyof typeof PM_DUE;
export const PM_DUE_ORDER: PmDueKey[] = ["OVERDUE", "DUE_SOON", "OK"];

/** Số ngày tới hạn được coi là "sắp đến hạn". */
export const PM_DUE_SOON_DAYS = 7;

/** Số ngày còn lại đến hạn (âm = đã quá hạn). */
export function daysUntilDue(nextDueAt: Date | string, now: Date = new Date()): number {
  const due = new Date(nextDueAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000);
}

export function pmDueStatus(nextDueAt: Date | string, now: Date = new Date()): PmDueKey {
  const d = daysUntilDue(nextDueAt, now);
  if (d < 0) return "OVERDUE";
  if (d <= PM_DUE_SOON_DAYS) return "DUE_SOON";
  return "OK";
}

/** Cộng số ngày vào một mốc thời gian, giữ giờ 08:00 cho ngày đến hạn. */
export function addDays(base: Date | string, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(8, 0, 0, 0);
  return d;
}

/** Cộng số tháng vào một mốc thời gian (giữ giờ 08:00). */
export function addMonths(base: Date | string, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  d.setHours(8, 0, 0, 0);
  return d;
}

// ---- Cảnh báo thay thế vật tư (Material replacement) ----

/** Gửi cảnh báo khi còn ≤ số ngày này trước hạn thay thế (≈ 1 tháng). */
export const REPLACEMENT_WARN_DAYS = 30;

/**
 * Trạng thái đến hạn thay thế của một điểm thay thế vật tư:
 *  OVERDUE  — đã quá hạn
 *  DUE_SOON — còn ≤ REPLACEMENT_WARN_DAYS ngày (vào diện cảnh báo)
 *  OK       — còn xa hạn
 */
export const REPL_DUE = {
  OVERDUE: { label: "Quá hạn", badge: "bg-red-100 text-red-800", dot: "#DC2626" },
  DUE_SOON: { label: "Sắp đến hạn", badge: "bg-amber-100 text-amber-800", dot: "#D97706" },
  OK: { label: "Còn hạn", badge: "bg-green-100 text-green-800", dot: "#16A34A" },
} as const;

export type ReplDueKey = keyof typeof REPL_DUE;
export const REPL_DUE_ORDER: ReplDueKey[] = ["OVERDUE", "DUE_SOON", "OK"];

export function replacementDueStatus(nextDueAt: Date | string, now: Date = new Date()): ReplDueKey {
  const d = daysUntilDue(nextDueAt, now);
  if (d < 0) return "OVERDUE";
  if (d <= REPLACEMENT_WARN_DAYS) return "DUE_SOON";
  return "OK";
}

/** Nhãn chu kỳ thay thế: "12 tháng" kèm ghi chú tuỳ chọn ("· 2500h"). */
export function replacementIntervalLabel(months: number, note?: string | null): string {
  const base = `${months} tháng`;
  return note ? `${base} · ${note}` : base;
}

// RBAC capability matrix
export const CAN = {
  createRepair: ["ADMIN", "SUPERVISOR", "TECHNICIAN"],
  approveRepair: ["ADMIN", "SUPERVISOR"],
  approveCheckIn: ["ADMIN", "SUPERVISOR"],
  manageUsers: ["ADMIN"],
  deleteDevice: ["ADMIN"],
  manageMaterials: ["ADMIN", "SUPERVISOR"],
  manageMaintenance: ["ADMIN", "SUPERVISOR", "TECHNICIAN"],
  manageReplacement: ["ADMIN", "SUPERVISOR"],
  manageDefect: ["ADMIN", "SUPERVISOR", "TECHNICIAN"],
} as const;

export function can(role: string | undefined, capability: keyof typeof CAN): boolean {
  if (!role) return false;
  return (CAN[capability] as readonly string[]).includes(role);
}
