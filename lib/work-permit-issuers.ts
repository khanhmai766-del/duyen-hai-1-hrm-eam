import { normalizeText } from "@/lib/nav";

/*
 * Nhóm được CẤP PHIẾU MỚI và HỦY NHÁP (quy định của phân xưởng, 27/09/2026) — cố định trong code, không theo
 * ma trận RBAC "work-permit-issue":
 *   - vai trò Quản trị, Quản lý, Trưởng ca, Kỹ thuật viên;
 *   - hoặc cương vị (chính hay kiêm nhiệm) Trưởng ca, Trưởng kíp lò máy (TK Lò máy), Trưởng kíp điện.
 * Trưởng kíp trên production mang vai trò Người xem nên phải xét theo cương vị. Vai trò tuỳ chỉnh "Trưởng kíp"
 * của RBAC từng gán cả nhóm Thiết bị đo lường điều khiển — nhóm đó KHÔNG được cấp/hủy phiếu.
 * Hủy phiếu đã cấp theo isPermitCanceller bên dưới; danh bạ nhà thầu, biện pháp an toàn vẫn theo RBAC.
 */
export const PERMIT_ISSUER_ROLES = ["ADMIN", "MANAGER", "SUPERVISOR", "TECHNICIAN"] as const;
const ISSUER_POSITIONS = ["truong ca", "tk lo may", "truong kip lo may", "truong kip dien", "tk dien"];

const positionKey = (value: string) => normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();

export type PermitIssuerCandidate = {
  role?: string | null;
  systemRole?: string | null;
  position?: string | null;
  primaryPosition?: string | null;
  secondaryPosition?: string | null;
  secondaryPosition2?: string | null;
};

export function isPermitIssuerPosition(position?: string | null) {
  const key = position ? positionKey(position) : "";
  // Chấp nhận hậu tố đơn vị/tổ máy ("Trưởng ca S1"), không chấp nhận chữ khác đứng trước.
  return Boolean(key) && ISSUER_POSITIONS.some(allowed => key === allowed || key.startsWith(`${allowed} `));
}

export function isPermitIssuer(user: PermitIssuerCandidate) {
  const roles = [user.role, user.systemRole];
  if (roles.some(role => (PERMIT_ISSUER_ROLES as readonly string[]).includes(role ?? ""))) return true;
  return [user.position, user.primaryPosition, user.secondaryPosition, user.secondaryPosition2].some(isPermitIssuerPosition);
}

/** Hủy phiếu đã cấp: các cấp quản lý đến Trưởng kíp lò máy/điện (07/10/2026). */
export function isPermitCanceller(user: PermitIssuerCandidate) {
  if ([user.role, user.systemRole].some(role => ["ADMIN", "MANAGER", "SUPERVISOR"].includes(role ?? ""))) return true;
  return [user.position, user.primaryPosition, user.secondaryPosition, user.secondaryPosition2].some(isPermitIssuerPosition);
}

export const PERMIT_ISSUER_DENIED = "Chỉ Quản trị, Quản lý, Kỹ thuật viên, Trưởng ca và Trưởng kíp (lò máy, điện) được cấp hoặc hủy phiếu công tác";
