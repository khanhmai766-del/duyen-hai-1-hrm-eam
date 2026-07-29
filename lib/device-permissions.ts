import { requirePermissionLevel } from "@/lib/rbac-guard";

type PermissionUser = { id?: string; role?: string };

export const DEVICE_VIEW_PERMISSION = "device-view";
export const DEVICE_MANAGE_PERMISSION = "device-manage";
export const DEVICE_DELETE_PERMISSION = "device-delete";

export function requireDeviceView(user: PermissionUser) {
  return requirePermissionLevel(
    user,
    DEVICE_VIEW_PERMISSION,
    ["read", "personal", "manage", "full"],
    "Bạn không có quyền xem thông tin thiết bị"
  );
}

export async function requireDeviceCreate(user: PermissionUser) {
  await requireDeviceView(user);
  return requirePermissionLevel(
    user,
    DEVICE_MANAGE_PERMISSION,
    ["personal", "manage", "full"],
    "Bạn không có quyền thêm thiết bị"
  );
}

export async function requireDeviceManage(user: PermissionUser, message = "Bạn không có quyền quản lý danh mục và cây thiết bị") {
  await requireDeviceView(user);
  return requirePermissionLevel(user, DEVICE_MANAGE_PERMISSION, ["manage", "full"], message);
}

export async function requireDeviceDelete(user: PermissionUser) {
  await requireDeviceView(user);
  return requirePermissionLevel(
    user,
    DEVICE_DELETE_PERMISSION,
    ["full"],
    "Chỉ người có Toàn quyền mới được xóa thiết bị"
  );
}
