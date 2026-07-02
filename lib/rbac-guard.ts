import { fail } from "@/lib/api";
import { hasAssignedPermissionLevel, type PermissionLevel } from "@/lib/rbac-permissions";

export async function requirePermissionLevel(
  user: { id?: string; role?: string },
  permissionId: string,
  levels: PermissionLevel[],
  message = "Không đủ quyền truy cập"
) {
  if (!(await hasAssignedPermissionLevel(user, permissionId, levels))) {
    throw fail(message, 403);
  }
}

export async function hasPermissionLevel(
  user: { id?: string; role?: string },
  permissionId: string,
  levels: PermissionLevel[]
) {
  return hasAssignedPermissionLevel(user, permissionId, levels);
}
