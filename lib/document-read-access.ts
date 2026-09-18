import { archiveCategoryPermissionId } from "@/lib/archive-permissions";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { OIL_SOOT_GATED_CATEGORIES } from "@/lib/oil-soot-access";
import { assertOilSootAccess } from "@/lib/server-access";

export async function requireDigitalDocumentReadPermission(user: { id?: string; role?: string }, category: string) {
  if (OIL_SOOT_GATED_CATEGORIES.has(category)) {
    await assertOilSootAccess(user);
    return;
  }
  const permissionId = category === "PROCEDURE"
    ? "document-procedure"
    : category === "PID"
      ? "document-pid"
      : archiveCategoryPermissionId(category);
  await requirePermissionLevel(
    user,
    permissionId || "archive-read",
    ["read", "personal", "manage", "full"],
    "Bạn không có quyền xem tài liệu"
  );
}
