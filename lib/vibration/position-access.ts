import { normalizeText } from "@/lib/nav";
import { positionCodeOf, type PositionCode } from "@/lib/position-catalog";

/**
 * Phân quyền nhập số đo độ rung theo cương vị — tái hiện VibraControl cũ (api/lib.php `user_access`).
 * - Quản trị: mọi quyền.
 * - Vị trí giám sát (Trưởng ca, TK Lò máy, Trưởng kíp điện, Quản đốc, Phó quản đốc, Kỹ thuật viên, Kỹ sư): xem tất cả,
 *   KHÔNG nhập số đo (chỉ lưu nhận xét phân tích).
 * - Cương vị vận hành: chỉ nhập / sửa thiết bị có `area` thuộc cương vị của mình (editAreas).
 * Tệp thuần (không import server) để dùng chung cho client và server.
 */

export interface VibrationAreaMap {
  /** Tên cương vị (VibrationDevice.area) theo app cũ. */
  area: string;
  code: PositionCode;
  /** Tổ máy của cương vị; null = cương vị chung, khớp mọi tổ máy. */
  unit: "S1" | "S2" | null;
}

export const VIBRATION_AREA_MAP: readonly VibrationAreaMap[] = [
  { area: "Lò phó S1", code: "BOILER_DEPUTY", unit: "S1" },
  { area: "Lò phó S2", code: "BOILER_DEPUTY", unit: "S2" },
  { area: "Máy phó S1", code: "TURBINE_DEPUTY", unit: "S1" },
  { area: "Máy phó S2", code: "TURBINE_DEPUTY", unit: "S2" },
  { area: "Trợ thủ S1", code: "TURBINE_ASSISTANT", unit: "S1" },
  { area: "Trợ thủ S2", code: "TURBINE_ASSISTANT", unit: "S2" },
  { area: "Máy nghiền S1", code: "COAL_MILL", unit: "S1" },
  { area: "Máy nghiền S2", code: "COAL_MILL", unit: "S2" },
  { area: "ESP S1", code: "ESP", unit: "S1" },
  { area: "ESP S2", code: "ESP", unit: "S2" },
  { area: "FGD S1", code: "FGD", unit: "S1" },
  { area: "FGD S2", code: "FGD", unit: "S2" },
  { area: "Thải xỉ", code: "ASH_HANDLING", unit: null },
  { area: "Trạm bơm tuần hoàn", code: "CIRCULATING_WATER_PUMP", unit: null },
  { area: "Khí nén - nhà dầu 300m3", code: "AIR_COMPRESSOR_OIL_HOUSE", unit: null },
  { area: "XLN hỗn hợp", code: "MIXED_WATER_TREATMENT", unit: null },
  { area: "XLNT - Nhà dầu 5000m3", code: "WASTEWATER_TREATMENT", unit: null },
  { area: "NH3 - Lò hơi phụ", code: "AUX_BOILER_NH3", unit: null },
  { area: "Trực chính điện", code: "ELECTRICAL_MAIN_OPERATOR", unit: null },
  { area: "Trực phụ điện", code: "ELECTRICAL_ASSISTANT_OPERATOR", unit: null },
  { area: "Trạm nước thô", code: "RAW_WATER_PUMP", unit: null },
];

/** Cương vị giám sát theo mã danh mục (VIEW_ALL_POSITIONS cũ: TKLM, Trưởng ca, Trưởng kíp điện). */
const VIEW_ALL_CODES = new Set<PositionCode>(["SHIFT_SUPERVISOR", "BOILER_TURBINE_SHIFT_LEAD", "ELECTRICAL_SHIFT_LEAD"]);

/** Chức danh giám sát (KTV, PQĐ, QĐ, Kỹ sư) — chuẩn hoá bỏ dấu; KTV I&C đã được danh mục nhận là cương vị vận hành nên không tới đây. */
const VIEW_ALL_TITLE_RE =
  /^(quan doc|pho quan doc|ky thuat vien|ky su|qd|pqd|ktv|tklm|tkd|tk dien)(?: .*)?$/;

export interface VibrationUserLike {
  role?: string | null;
  systemRole?: string | null;
  position?: string | null;
  primaryPosition?: string | null;
  secondaryPosition?: string | null;
  secondaryPosition2?: string | null;
  currentPosition?: string | null;
}

export interface VibrationAccess {
  admin: boolean;
  /** Xem mọi thiết bị (giám sát hoặc admin). */
  viewAll: boolean;
  /** Cương vị (VibrationDevice.area) được nhập / sửa. */
  editAreas: string[];
  /** Đã được gán ít nhất một cương vị / chức danh. */
  declared: boolean;
  /** Có vị trí giám sát (Trưởng ca, TKLM, TKĐ, QĐ, PQĐ, KTV, Kỹ sư). */
  supervisor: boolean;
}

function unitOf(position: string): "S1" | "S2" | null {
  const m = /(?:^|[\s._-])S\s?([12])\s*$/i.exec(position.trim());
  return m ? (`S${m[1]}` as "S1" | "S2") : null;
}

function isViewAllPosition(position: string) {
  const code = positionCodeOf(position);
  if (code) return VIEW_ALL_CODES.has(code);
  return VIEW_ALL_TITLE_RE.test(normalizeText(position).replace(/[^a-z0-9]+/g, " ").trim());
}

export function vibrationUserPositions(user: VibrationUserLike) {
  const out: string[] = [];
  for (const v of [user.currentPosition, user.position, user.primaryPosition, user.secondaryPosition, user.secondaryPosition2]) {
    const s = String(v ?? "").trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export function vibrationAccessFor(user: VibrationUserLike | null | undefined): VibrationAccess {
  if (!user) return { admin: false, viewAll: false, editAreas: [], declared: false, supervisor: false };
  const admin = user.role === "ADMIN";
  const positions = vibrationUserPositions(user);
  const supervisor = positions.some(isViewAllPosition);
  const editSet = new Set<string>();
  for (const p of positions) {
    const code = positionCodeOf(p);
    if (!code || VIEW_ALL_CODES.has(code)) continue;
    const unit = unitOf(p);
    for (const a of VIBRATION_AREA_MAP) {
      if (a.code === code && (!a.unit || !unit || a.unit === unit)) editSet.add(a.area);
    }
  }
  return {
    admin,
    viewAll: admin || supervisor,
    editAreas: VIBRATION_AREA_MAP.map((a) => a.area).filter((a) => editSet.has(a)),
    declared: positions.length > 0,
    supervisor,
  };
}

export function canEditVibrationArea(access: Pick<VibrationAccess, "admin" | "editAreas">, area: string) {
  return access.admin || access.editAreas.includes(area);
}

/** Thông báo chỉ-xem dùng chung (client) — lấy nguyên văn từ app cũ. */
export function vibrationReadOnlyNotice(access: VibrationAccess, area?: string) {
  if (access.admin) return null;
  if (!access.declared) return "Tài khoản chưa được gán cương vị — liên hệ quản trị viên để được gán cương vị theo danh sách người dùng.";
  if (area === undefined ? access.editAreas.length > 0 : access.editAreas.includes(area)) return null;
  if (!access.editAreas.length && access.supervisor) return "Tài khoản giám sát chỉ xem — không nhập hoặc lưu số đo.";
  return `Chỉ xem: thiết bị ngoài cương vị của bạn${access.editAreas.length ? ` (${access.editAreas.join(", ")})` : ""}.`;
}

/** Thông báo lỗi server khi ghi thiết bị ngoài phạm vi (nguyên văn app cũ). */
export function vibrationDenyMessage(access: VibrationAccess, deniedNames: string[]) {
  if (!access.declared) return "Tài khoản chưa được gán cương vị — liên hệ quản trị viên (Quản lý người dùng › Cương vị).";
  const head = access.editAreas.length
    ? `Chỉ được nhập / sửa thiết bị thuộc cương vị đã khai báo (${access.editAreas.join(", ")}).`
    : access.supervisor
      ? "Vị trí giám sát chỉ nhập ở menu Phân tích độ rung, không nhập số đo / danh mục."
      : "Tài khoản chỉ xem: không được nhập hoặc sửa dữ liệu.";
  return `${head} Thiết bị ngoài phạm vi: ${[...new Set(deniedNames)].slice(0, 5).join(", ")}`;
}
