import { isShiftCommandPosition } from "@/lib/constants";
import { positionCodeOf } from "@/lib/position-catalog";
import { OPERATION_POSITION_TITLES } from "@/lib/positions";

/** Vai trò được sửa/xóa lần vi phạm của nhân viên nhà thầu (ngoài cương vị Trưởng ca/Trưởng kíp). */
const PERMIT_VIOLATION_EDITOR_ROLES = ["ADMIN", "MANAGER", "SUPERVISOR", "TECHNICIAN"];

/** Quản trị, Quản lý, Trưởng ca, Kỹ thuật viên hoặc người đang giữ cương vị Trưởng ca/Trưởng kíp. Dùng chung cho nút và API. */
export function canChangePermitViolation(user: { role?: string | null; position?: string | null } | null | undefined): boolean {
  if (!user) return false;
  return PERMIT_VIOLATION_EDITOR_ROLES.includes(user.role ?? "") || isShiftCommandPosition(user.position);
}

/** Phạm vi cương vị server gửi kèm danh sách PCT (`meta.positionScope`, lib/server/work-permit-scope.ts). */
export type PermitPositionScope = { all: boolean; codes: string[] };

/**
 * Cương vị được chọn trên biểu mẫu / ô lọc của sổ PCT: người xem toàn bộ thấy đủ danh mục, còn lại chỉ cương vị
 * đang làm việc + cấp dưới. Chưa có phạm vi (đang tải) thì bày đủ — server vẫn chặn khi lưu.
 */
export function permitPositionOptions(scope?: PermitPositionScope | null): string[] {
  if (!scope || scope.all) return [...OPERATION_POSITION_TITLES];
  return OPERATION_POSITION_TITLES.filter(title => {
    const code = positionCodeOf(title);
    return Boolean(code && scope.codes.includes(code));
  });
}
