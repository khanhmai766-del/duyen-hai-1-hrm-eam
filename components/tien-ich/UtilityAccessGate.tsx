import { requireUser } from "@/lib/api";
import { hasPermissionLevel } from "@/lib/rbac-guard";
import { UTILITY_VIEW_LEVELS } from "@/lib/utility-permissions";

/** Chặn trang Tiện ích theo quyền xem ở /admin/roles (nhóm "Tiện ích"); menu đã ẩn mục, đây là lớp chặn khi gõ thẳng URL. */
export async function UtilityAccessGate({ permissionId, label, children }: { permissionId: string; label: string; children: React.ReactNode }) {
  const user = await requireUser();
  if (!(await hasPermissionLevel(user, permissionId, [...UTILITY_VIEW_LEVELS]))) {
    return <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">Bạn không có quyền truy cập {label}.</p>;
  }
  return <>{children}</>;
}
