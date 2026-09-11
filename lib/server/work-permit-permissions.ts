import { hasPermissionLevel, requirePermissionLevel } from "@/lib/rbac-guard";
import { PERMIT_ISSUE_PERMISSION, PERMIT_EXECUTE_PERMISSION } from "@/lib/work-permit-permissions";
type PermitUser = { id?: string; role?: string; accessMode?: string };
const writeLevels = ["personal", "manage", "full"] as const;
export async function permitCapabilities(user: PermitUser) {
  const [canIssue, canExecute] = await Promise.all([
    hasPermissionLevel(user, PERMIT_ISSUE_PERMISSION, [...writeLevels]),
    hasPermissionLevel(user, PERMIT_EXECUTE_PERMISSION, [...writeLevels]),
  ]);
  return { canIssue, canExecute };
}
export function requirePermitIssue(user: PermitUser) {
  return requirePermissionLevel(user, PERMIT_ISSUE_PERMISSION, [...writeLevels], "Bạn không có quyền cấp hoặc chỉnh sửa phiếu công tác");
}
export function requirePermitExecute(user: PermitUser) {
  return requirePermissionLevel(user, PERMIT_EXECUTE_PERMISSION, [...writeLevels], "Bạn không có quyền thực hiện phiếu công tác");
}
