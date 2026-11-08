import { LOOKUP_ACCESS_MODE } from "@/lib/lookup-access";
import { DEFAULT_POSITIONS } from "./default-positions";
import { ctktktPositionKey, defaultPositionGrants, permissionsForPosition, type PositionGrants } from "./position-permissions";
import { PERMISSIONS, type SessionUser, type Role } from "./session";
export type HostUser = { id:string;role:string;accessMode?:string;mustChangePassword?:boolean;position?:string|null;email?:string|null;employeeId?:string|null;name?:string|null };

export function mapHostUser(host: HostUser, map: Record<string, string>, grants: PositionGrants = defaultPositionGrants()): SessionUser | null {
  if (host.accessMode === LOOKUP_ACCESS_MODE || host.mustChangePassword) return null;
  if (!["read", "personal", "manage", "full"].includes(map["ctktkt-access"])) return null;
  const position = host.position ?? "";
  const policy = DEFAULT_POSITIONS.find(p => ctktktPositionKey(p.position) === ctktktPositionKey(position));
  // Chỉ ADMIN đang bật chế độ quản trị giữ bypass hệ thống. Lãnh đạo KTKT lấy quyền từ bảng riêng.
  const role: Role = host.role === "ADMIN" ? "admin" : policy?.role === "admin" ? "viewer" : policy?.role ?? "viewer";
  return {
    id: host.id, username: host.email || host.employeeId || host.id, displayName: host.name || "Người dùng",
    employeeCode: host.employeeId ?? undefined, position, role,
    permissions: host.role === "ADMIN" ? [...PERMISSIONS] : permissionsForPosition(position, grants),
    canDelegateInputs: host.role === "ADMIN" || ["read", "personal", "manage", "full"].includes(map["ctktkt-delegate"]),
  };
}
