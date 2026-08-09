/**
 * PHẠM VI XEM KHIẾM KHUYẾT THEO CƯƠNG VỊ — nguồn chuẩn duy nhất.
 *
 * Trước đây quyền xem phiếu khiếm khuyết bị chia làm hai luật khác nhau:
 *   - phiếu CHƯA gắn thiết bị → xét cột Cương vị (`Defect.system`);
 *   - phiếu ĐÃ gắn thiết bị   → chỉ xét phạm vi cây thiết bị, BỎ QUA cương vị.
 * Hệ quả: Trợ thủ vẫn thấy phiếu "Máy phó S1" / "VHV TBTH", vì thiết bị của các
 * cương vị đó nằm chung nhánh cây mà Trợ thủ được cấp quyền xem.
 *
 * Nghiệp vụ đã chốt (2026-08-09): CƯƠNG VỊ LÀ RÀO QUYỀN ĐỘC LẬP, áp cho MỌI phiếu
 * bất kể đã gắn thiết bị hay chưa, và GIAO (AND) với phạm vi cây thiết bị.
 *
 * Ai được xem toàn bộ — thoả MỘT trong ba là đủ:
 *   - ADMIN;
 *   - `defect-manage` mức manage/full (Quản đốc, quản lý, Trưởng ca…);
 *   - cương vị không bị giới hạn cây thiết bị (Quản đốc / Phó QĐ / KTV / Trưởng ca),
 *     vì các cương vị này không nằm trong danh mục vận hành nên không có mã để so.
 *
 * Còn lại: chỉ thấy cương vị của mình VÀ cương vị cấp dưới theo sơ đồ ca trực —
 * phân cấp lấy nguyên từ `canViewUnmappedDefectPosition` (lib/positions.ts) nên
 * hai nhánh cũ giờ dùng đúng một luật, không thể lệch nhau.
 */
import { hasPermissionLevel } from "@/lib/rbac-guard";
import {
  POSITION_CATALOG,
  positionCodeOf,
  positionLabelOf,
  type PositionCode,
} from "@/lib/position-catalog";
import { canViewUnmappedDefectPosition } from "@/lib/positions";
import { isUnrestrictedEquipmentPosition } from "@/lib/position-system-scopes";

/** `all` = xem mọi cương vị; ngược lại chỉ các mã trong `codes`. */
export type DefectViewScope = { all: boolean; codes: PositionCode[] };

export const DEFECT_VIEW_SCOPE_ALL: DefectViewScope = { all: true, codes: [] };

type DefectPositionCarrier = {
  id?: string;
  role?: string;
  position?: string | null;
  primaryPosition?: string | null;
  secondaryPosition?: string | null;
  secondaryPosition2?: string | null;
  currentPosition?: string | null;
};

/**
 * Các cương vị người dùng đang mang: chính + hai kiêm nhiệm + cương vị đang làm việc.
 * Gộp cả bốn (giống phạm vi ghi của PCCC — xem lib/pccc-service.ts): người quên chuyển
 * "cương vị đang làm việc" thì vẫn phải thấy phần việc theo chức danh đã khai báo.
 */
function ownPositionsOf(user: DefectPositionCarrier) {
  return [
    user.primaryPosition ?? user.position,
    user.secondaryPosition,
    user.secondaryPosition2,
    user.currentPosition,
  ].filter((value): value is string => Boolean(value && String(value).trim()));
}

/**
 * Bung một cương vị thành tập MÃ chức danh được xem, kể cả cấp dưới.
 * Duyệt cả danh mục và hỏi lại chính hàm phân cấp cũ, thay vì chép lại luật —
 * thêm cương vị mới vào danh mục là tự động đúng.
 */
function viewableCodesFor(viewerPosition: string): PositionCode[] {
  return POSITION_CATALOG
    .filter((item) => canViewUnmappedDefectPosition(item.label, viewerPosition))
    .map((item) => item.code);
}

/**
 * Phạm vi xem của người đăng nhập. Cương vị rỗng / không khớp danh mục → `codes` rỗng
 * → KHÔNG thấy phiếu nào; buộc quản trị khai báo chức danh trước, thay vì âm thầm nới
 * thành "xem tất".
 */
export async function resolveDefectViewScope(
  user: DefectPositionCarrier
): Promise<DefectViewScope> {
  if (user.role === "ADMIN") return DEFECT_VIEW_SCOPE_ALL;
  if (await hasPermissionLevel(user, "defect-manage", ["manage", "full"])) {
    return DEFECT_VIEW_SCOPE_ALL;
  }

  const positions = ownPositionsOf(user);
  if (positions.some(isUnrestrictedEquipmentPosition)) return DEFECT_VIEW_SCOPE_ALL;

  const codes = new Set<PositionCode>();
  for (const position of positions) {
    for (const code of viewableCodesFor(position)) codes.add(code);
  }
  return { all: false, codes: [...codes] };
}

/**
 * Cột Cương vị (`Defect.system`) có được người này xem không.
 *
 * Giá trị rỗng hoặc không khớp danh mục → CHỈ người xem toàn bộ mới thấy. Phiếu vô chủ
 * phải có người quản lý nhìn thấy để gán cương vị, nhưng không được rơi vào tay một
 * cương vị bất kỳ. Đếm số dòng bị ẩn vì lý do này bằng `unmatchedDefectPosition`.
 */
export function canViewDefectPosition(
  system: string | null | undefined,
  scope: DefectViewScope
) {
  if (scope.all) return true;
  const code = positionCodeOf(system);
  return code ? scope.codes.includes(code) : false;
}

/** true khi cột Cương vị không quy được về danh mục chức danh (rỗng hoặc nhãn lạ). */
export function unmatchedDefectPosition(system: string | null | undefined) {
  return positionCodeOf(system) === null;
}

/** Gửi xuống client để ô lọc "Cương vị" chỉ bày cương vị người dùng được xem. */
export function defectViewScopeMeta(scope: DefectViewScope) {
  return {
    all: scope.all,
    codes: scope.codes as string[],
    labels: scope.codes.map((code) => positionLabelOf(code)).sort((a, b) => a.localeCompare(b, "vi")),
  };
}
