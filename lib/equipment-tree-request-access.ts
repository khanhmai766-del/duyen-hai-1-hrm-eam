import { fail } from "@/lib/api";
import { announcementPositionsMatch } from "@/lib/positions";
import { hasAssignedManagePermission } from "@/lib/rbac-permissions";

type EquipmentTreeRequestUser = {
  id?: string;
  role?: string;
  position?: string | null;
  currentPosition?: string | null;
};

/**
 * Cho phép màn hình nghiệp vụ dựng cây theo cương vị đang được xử lý thay vì
 * luôn dùng cương vị đăng nhập. Chỉ người có quyền quản lý khiếm khuyết mới
 * được chuyển sang một cương vị khác; API vẫn là nơi quyết định phạm vi cuối.
 */
export async function resolveEquipmentTreeRequestUser<
  T extends EquipmentTreeRequestUser,
>(user: T, requestedPosition?: string | null): Promise<T> {
  const targetPosition = requestedPosition?.trim();
  if (!targetPosition) return user;

  const activePosition = user.currentPosition ?? user.position;
  if (
    activePosition &&
    announcementPositionsMatch(activePosition, targetPosition)
  ) {
    return user;
  }

  const canManageDefects = await hasAssignedManagePermission(
    user,
    "defect-manage"
  );
  if (!canManageDefects) {
    throw fail(
      "Bạn không có quyền xem cây thiết bị của cương vị đã chọn",
      403
    );
  }

  return {
    ...user,
    position: targetPosition,
    currentPosition: targetPosition,
  };
}
