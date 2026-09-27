import { positionCodeOf } from "@/lib/position-catalog";
import { OPERATION_POSITION_TITLES } from "@/lib/positions";

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
