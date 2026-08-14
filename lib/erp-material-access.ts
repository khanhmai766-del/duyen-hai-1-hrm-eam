import { requirePermissionLevel } from "@/lib/rbac-guard";

type RbacUser = { id?: string; role?: string; accessMode?: string };

export const ERP_MATERIAL_PERMISSION_ID = "erp-material-manage";

export function requireErpMaterialView(user: RbacUser) {
  return requirePermissionLevel(
    user,
    ERP_MATERIAL_PERMISSION_ID,
    ["read", "personal", "manage", "full"],
    "Không đủ quyền xem Vật tư theo ERP"
  );
}

export function requireErpMaterialManage(user: RbacUser) {
  return requirePermissionLevel(
    user,
    ERP_MATERIAL_PERMISSION_ID,
    ["manage", "full"],
    "Không đủ quyền quản lý Vật tư theo ERP"
  );
}
