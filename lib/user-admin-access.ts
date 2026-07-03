import { fail } from "@/lib/api";
import { hasPermissionLevel } from "@/lib/rbac-guard";

const USER_LIST_PERMISSIONS = [
  { id: "user-manage", levels: ["read", "manage", "full"] },
  { id: "user-reset-viewer-password", levels: ["approve", "manage", "full"] },
  { id: "system_audit_log:view", levels: ["read", "manage", "full"] },
  { id: "rbac-manage", levels: ["full"] },
] as const;

export async function hasUserAdminReadAccess(user: { id?: string; role?: string }) {
  if (user.role === "ADMIN") return true;
  const checks = await Promise.all(
    USER_LIST_PERMISSIONS.map((permission) => hasPermissionLevel(user, permission.id, [...permission.levels]))
  );
  return checks.some(Boolean);
}

export async function requireUserAdminReadAccess(user: { id?: string; role?: string }) {
  if (!(await hasUserAdminReadAccess(user))) {
    throw fail("Không đủ quyền xem danh sách người dùng", 403);
  }
}
