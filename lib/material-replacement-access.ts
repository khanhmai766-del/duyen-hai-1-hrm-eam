import type { EquipmentAccessContext } from "@/lib/server-access";
import { canViewPosition, type PositionViewScope } from "@/lib/position-data-scope";

type ReplacementScopeTarget = {
  deviceSeq?: string | null;
  system?: string | null;
  /** Mã cương vị quản lý; nhãn `managingPosition` dùng làm dự phòng cho dữ liệu cũ. */
  managingPositionCode?: string | null;
  managingPosition?: string | null;
  /**
   * Khác null = dòng LƯU TRỮ nhập từ sổ theo dõi vật tư. Sổ không có cột thiết bị nên
   * các dòng này không có `deviceSeq` lẫn `system` để đối chiếu với cây thiết bị.
   */
  importSource?: string | null;
};

/**
 * Quyền XEM một điểm thay thế = GIAO của hai rào:
 *  1. cương vị quản lý của điểm (`managingPositionCode`) nằm trong phạm vi xem;
 *  2. thiết bị/hệ thống của điểm nằm trong phạm vi cây thiết bị.
 *
 * `view` là tham số BẮT BUỘC (không có giá trị mặc định) để một route đọc mới quên
 * truyền là lỗi biên dịch chứ không phải lỗ hổng âm thầm — muốn xem toàn bộ thì phải
 * viết rõ `POSITION_SCOPE_ALL`. Cùng khuôn với `scopeWhere` của PCCC.
 */
export function canViewMaterialReplacement(
  access: EquipmentAccessContext,
  target: ReplacementScopeTarget,
  view: PositionViewScope
) {
  if (!canViewPosition(target.managingPositionCode ?? target.managingPosition, view)) return false;
  if (!access.hasExplicitScopes) return true;
  if (target.deviceSeq) return access.canViewSeq(target.deviceSeq);
  if (target.system) return access.canViewDeviceLike({ system: target.system });
  // Dòng LƯU TRỮ không có thiết bị lẫn hệ thống để đối chiếu với cây thiết bị, nên rào
  // cương vị ở trên là rào duy nhất áp dụng được. Không có nhánh này thì mọi cương vị
  // có cấu hình phạm vi cây (hiện là 1205 bản ghi trên prod) sẽ KHÔNG thấy dòng nào.
  if (target.importSource) return true;
  return false;
}

/**
 * Quyền GHI giữ nguyên luật cũ: chỉ xét cây thiết bị. Rào cương vị mới chỉ thu hẹp phần
 * XEM — siết cả phần ghi sẽ chặn công việc đang chạy của những người được giao chéo
 * cương vị, việc đó phải bàn riêng chứ không đi kèm thay đổi hiển thị.
 */
export function canEditMaterialReplacement(
  access: EquipmentAccessContext,
  target: ReplacementScopeTarget
) {
  if (!access.hasExplicitScopes) return true;
  return access.canEditDeviceLike({
    device: target.deviceSeq,
    system: target.system,
  });
}
