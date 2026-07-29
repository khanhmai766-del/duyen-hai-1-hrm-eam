import { hasAssignedManagePermission } from "@/lib/rbac-permissions";

export type MaterialEquipmentPermission = "material-manage" | "replacement-manage";

type PermissionUser = {
  id?: string;
  role?: string;
};

export function materialEquipmentPermission(value: string | null | undefined): MaterialEquipmentPermission | null {
  return value === "material-manage" || value === "replacement-manage" ? value : null;
}

/**
 * Một số form vật tư cần chọn thiết bị trên toàn cây khi người dùng đã được cấp
 * quyền Quản lý/Toàn quyền cho đúng nghiệp vụ. Tham số từ client chỉ chọn ngữ
 * cảnh; quyết định cuối cùng luôn được kiểm tra lại bằng RBAC phía server.
 */
export async function canBypassEquipmentPositionScope(
  user: PermissionUser,
  value: string | null | undefined
) {
  const permissionId = materialEquipmentPermission(value);
  return permissionId ? hasAssignedManagePermission(user, permissionId) : false;
}
