import { fail } from "@/lib/api";
import { hasAssignedPermissionLevel, type PermissionLevel } from "@/lib/rbac-permissions";

export async function requirePermissionLevel(
  user: { id?: string; role?: string; accessMode?: string },
  permissionId: string,
  levels: PermissionLevel[],
  message = "Không đủ quyền truy cập"
) {
  if (user.accessMode === "DEFECT_READ_ONLY") {
    throw fail("Tài khoản này chỉ được tra cứu khiếm khuyết", 403);
  }
  if (!(await hasAssignedPermissionLevel(user, permissionId, levels))) {
    throw fail(message, 403);
  }
}

export async function hasPermissionLevel(
  user: { id?: string; role?: string; accessMode?: string },
  permissionId: string,
  levels: PermissionLevel[]
) {
  if (user.accessMode === "DEFECT_READ_ONLY") return false;
  return hasAssignedPermissionLevel(user, permissionId, levels);
}
