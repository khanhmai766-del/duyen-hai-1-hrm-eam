import { NextRequest } from "next/server";
import { ok, handle, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { assignedPermissionMap, type PermissionLevel } from "@/lib/rbac-permissions";
import { isUnrestrictedEquipmentPosition, normalizePositionScopeKey, scopesForPosition } from "@/lib/position-system-scopes";
import { loadPositionSystemScopeRows } from "@/lib/server-access";

export const dynamic = "force-dynamic";

const WRITE_CHECKS: Array<{
  permissionId: string;
  label: string;
  levels: PermissionLevel[];
}> = [
  { permissionId: "device-manage", label: "Thêm, sửa và nhập thiết bị", levels: ["personal", "manage", "full"] },
  { permissionId: "device-delete", label: "Xóa từng thiết bị", levels: ["full"] },
  { permissionId: "repair-edit", label: "Tạo/cập nhật lịch sử sửa chữa và phiếu khiếm khuyết", levels: ["personal", "manage", "full"] },
  { permissionId: "repair-approve", label: "Xác nhận kết quả sửa chữa", levels: ["manage", "full"] },
  { permissionId: "defect-close", label: "Đóng phiếu khiếm khuyết", levels: ["manage", "full"] },
  { permissionId: "defect-delete", label: "Xóa phiếu khiếm khuyết", levels: ["full"] },
  { permissionId: "defect-history-delete", label: "Xóa lịch sử khiếm khuyết", levels: ["full"] },
];

export async function GET(req: NextRequest) {
  return handle(async () => {
    const currentUser = await requireUser();
    await requirePermissionLevel(currentUser, "rbac-manage", ["full"], "Không đủ quyền kiểm tra xung đột phân quyền");

    const position = req.nextUrl.searchParams.get("position")?.trim() ?? "";
    const positionKey = normalizePositionScopeKey(position);
    if (!positionKey) return ok({ users: [], hasExplicitScope: false, hasEditScope: false });

    const [users, allScopes] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          position: true,
          secondaryPosition: true,
          secondaryPosition2: true,
          role: true,
        },
      }),
      loadPositionSystemScopeRows(),
    ]);
    const positionScopes = scopesForPosition(allScopes, position);
    const fixedUnrestricted = isUnrestrictedEquipmentPosition(position);
    const hasExplicitScope = positionScopes.length > 0;
    const hasEditScope = fixedUnrestricted || positionScopes.some((scope) => scope.access === "edit");
    const matchingUsers = users.filter((user) =>
      [user.position, user.secondaryPosition, user.secondaryPosition2]
        .some((value) => normalizePositionScopeKey(value) === positionKey)
    );

    const rows = await Promise.all(matchingUsers.map(async (user) => {
      const permissions = await assignedPermissionMap({ id: user.id, role: user.role });
      const allowed = WRITE_CHECKS
        .filter((check) => check.levels.includes(permissions[check.permissionId] ?? "none"))
        .map((check) => ({ id: check.permissionId, label: check.label, level: permissions[check.permissionId] ?? "none" }));
      const blocked = WRITE_CHECKS
        .filter((check) => !check.levels.includes(permissions[check.permissionId] ?? "none"))
        .map((check) => ({ id: check.permissionId, label: check.label, level: permissions[check.permissionId] ?? "none" }));

      return {
        role: user.role,
        adminBypassesScope: user.role === "ADMIN" && !fixedUnrestricted,
        allowed,
        blocked,
      };
    }));

    return ok({
      users: rows,
      hasExplicitScope,
      hasEditScope,
      fixedUnrestricted,
      explicitScopeCount: positionScopes.length,
    });
  });
}
