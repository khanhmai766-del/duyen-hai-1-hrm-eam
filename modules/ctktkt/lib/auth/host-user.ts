import { LOOKUP_ACCESS_MODE } from "@/lib/lookup-access";
import { normalizeText } from "@/lib/nav";
import { positionLabelOf } from "@/lib/position-catalog";
import { DEFAULT_POSITIONS } from "./default-positions";
import { migrateLegacyPermissions } from "./permission-migration";
import { PERMISSIONS, type SessionUser, type Role } from "./session";
export type HostUser = { id:string;role:string;accessMode?:string;mustChangePassword?:boolean;position?:string|null;email?:string|null;employeeId?:string|null;name?:string|null };
export function mapHostUser(host:HostUser,map:Record<string,string>):SessionUser|null {
  if (host.accessMode === LOOKUP_ACCESS_MODE || host.mustChangePassword) return null;
  if (!["read", "personal", "manage", "full"].includes(map["ctktkt-access"])) return null;
  const position = host.position ?? "";
  const policyPosition = positionLabelOf(position);
  const normalized = normalizeText(policyPosition).replace(/\s+s[12]$/i, "");
  const policy = DEFAULT_POSITIONS.find(p => normalizeText(p.position) === normalized);
  const elevated = ["MANAGER", "SUPERVISOR"].includes(host.role);
  const role: Role = host.role === "ADMIN" ? "admin" : elevated ? "supervisor" : policy?.role === "technician" ? "technician" : "viewer";
  const user: SessionUser = { id: host.id, username: host.email || host.employeeId || host.id,
    displayName: host.name || "Người dùng", employeeCode: host.employeeId ?? undefined, position, role, permissions: [] };
  const base = host.role === "VIEWER" ? [] : elevated ? PERMISSIONS.filter(p => p !== "manage_users") : policy?.permissions.filter(p => p !== "manage_users") ?? ["view_all" as const];
  const defaults = new Set(migrateLegacyPermissions({ ...user, position: policyPosition, permissions: [...base] }));
  user.permissions = PERMISSIONS.filter(permission => {
    const level = map[`ctktkt:${permission}`];
    return level === "manage" || level === "full" || (level === "personal" && defaults.has(permission));
  });
  // Chỉ ADMIN đang bật chế độ quản trị được giữ role admin; cương vị không thay thế quyền hệ thống.
  return user;
}
