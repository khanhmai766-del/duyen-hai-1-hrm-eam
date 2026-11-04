import { mapHostUser } from "./host-user";
import { cache } from "react";
import { requireUser, fail } from "@/lib/api";
import { assignedPermissionMap } from "@/lib/rbac-permissions";
import { isAdminUser, hasPermission, type SessionUser, type Role, type Permission } from "./session";

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  let host;
  try { host = await requireUser(); } catch (error) { if(error instanceof Response) return null; throw error; }
  return mapHostUser(host,await assignedPermissionMap(host));
});

type Guard = { ok:true; user:SessionUser } | { ok:false; response:Response };
export async function requireSession(): Promise<Guard> {
  const user = await getSessionUser();
  return user ? {ok:true,user} : {ok:false,response:fail("Chưa đăng nhập hoặc chưa được cấp quyền Chỉ tiêu KTKT.",401)};
}
export async function requireRole(...roles: Role[]): Promise<Guard> {
  const guard = await requireSession();
  return !guard.ok || roles.includes(guard.user.role) || isAdminUser(guard.user) ? guard : {ok:false,response:fail("Không đủ quyền thực hiện thao tác này.",403)};
}
export async function requirePermission(permission: Permission): Promise<Guard> { return requireAnyPermission(permission); }
export async function requireAnyPermission(...permissions: Permission[]): Promise<Guard> {
  const guard=await requireSession();
  return !guard.ok || permissions.some(p=>hasPermission(guard.user,p)) ? guard : {ok:false,response:fail("Không đủ quyền thực hiện thao tác này.",403)};
}
export async function requireAdmin(): Promise<Guard> { return requirePermission("manage_users"); }
