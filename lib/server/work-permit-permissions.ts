import { fail } from "@/lib/api";
import { hasPermissionLevel, requirePermissionLevel } from "@/lib/rbac-guard";
import { PERMIT_ISSUE_PERMISSION, PERMIT_EXECUTE_PERMISSION } from "@/lib/work-permit-permissions";
import { isPermitIssuer, PERMIT_ISSUER_DENIED, type PermitIssuerCandidate } from "@/lib/work-permit-issuers";
type PermitUser = PermitIssuerCandidate & { id?: string; role?: string; accessMode?: string };
const writeLevels = ["personal", "manage", "full"] as const;

/** Nhóm cố định được cấp phiếu mới / hủy phiếu (lib/work-permit-issuers.ts). */
function issuer(user: PermitUser) {
  return user.accessMode !== "DEFECT_READ_ONLY" && isPermitIssuer(user);
}

/**
 * `canIssueNew`: cấp phiếu mới, lấy số, hủy phiếu — chỉ nhóm cố định.
 * `canIssue`: sửa thông tin phiếu, danh bạ nhà thầu, biện pháp an toàn — nhóm cố định HOẶC quyền RBAC "Cấp phiếu".
 */
export async function permitCapabilities(user: PermitUser) {
  const canIssueNew = issuer(user);
  const [rbacIssue, canExecute] = await Promise.all([
    canIssueNew ? Promise.resolve(true) : hasPermissionLevel(user, PERMIT_ISSUE_PERMISSION, [...writeLevels]),
    hasPermissionLevel(user, PERMIT_EXECUTE_PERMISSION, [...writeLevels]),
  ]);
  return { canIssue: canIssueNew || rbacIssue, canIssueNew, canExecute };
}
export async function requirePermitIssue(user: PermitUser) {
  if (issuer(user)) return;
  await requirePermissionLevel(user, PERMIT_ISSUE_PERMISSION, [...writeLevels], "Bạn không có quyền cấp hoặc chỉnh sửa phiếu công tác");
}
/** Cấp phiếu mới / lấy số / hủy phiếu — chặt theo nhóm cố định, không nới theo RBAC. */
export function requirePermitIssuer(user: PermitUser) {
  if (!issuer(user)) throw fail(PERMIT_ISSUER_DENIED, 403);
}
export function requirePermitExecute(user: PermitUser) {
  return requirePermissionLevel(user, PERMIT_EXECUTE_PERMISSION, [...writeLevels], "Bạn không có quyền thực hiện phiếu công tác");
}
