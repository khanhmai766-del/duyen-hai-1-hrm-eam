import { archiveCategoryPermissionId } from "@/lib/archive-permissions";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { OIL_SOOT_GATED_CATEGORIES } from "@/lib/oil-soot-access";
import { assertOilSootAccess } from "@/lib/server-access";

export async function requireDigitalDocumentReadPermission(user: { id?: string; role?: string; accessMode?: string }, category: string) {
  return requireDigitalDocumentPermission(user, category, "read");
}

export async function requireDigitalDocumentPermission(
  user: { id?: string; role?: string; accessMode?: string }, category: string,
  action: "read" | "create" | "manage" | "delete",
) {
  if (OIL_SOOT_GATED_CATEGORIES.has(category) && !(action === "read" && user.accessMode === "DEFECT_READ_ONLY")) {
    await assertOilSootAccess(user);
    if (action === "read") return;
  }
  const permissionId = category === "PROCEDURE"
    ? "document-procedure"
    : category === "PID"
      ? "document-pid"
      : archiveCategoryPermissionId(category);
  await requirePermissionLevel(
    user,
    permissionId || (action === "read" ? "archive-read" : action === "manage" ? "archive-edit" : "archive-create-delete"),
    action === "read" ? ["read", "personal", "manage", "full"] : action === "create" ? ["personal", "manage", "full"] : ["manage", "full"],
    `Bạn không có quyền ${action === "read" ? "xem" : action === "create" ? "thêm" : action === "manage" ? "chỉnh sửa" : "xoá"} tài liệu`
  );
}
