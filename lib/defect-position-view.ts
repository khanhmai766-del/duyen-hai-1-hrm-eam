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
 *   - `defect-view` mức manage/full — quyền RIÊNG cho phạm vi xem. KHÔNG dùng
 *     `defect-manage`: quyền đó bị quy về `repair-edit` (lib/rbac-permissions.ts) và
 *     trên thực tế đã mở mức "manage" cho mọi vai trò, kể cả VIEWER, nên gắn rào xem
 *     vào nó thì 100% tài khoản lọt cổng và rào không bao giờ có hiệu lực;
 *   - cương vị không bị giới hạn cây thiết bị (Quản đốc / Phó QĐ / KTV / Trưởng ca),
 *     vì các cương vị này không nằm trong danh mục vận hành nên không có mã để so.
 *
 * Còn lại: chỉ thấy cương vị ĐANG LÀM VIỆC (không gộp kiêm nhiệm — xem `ownPositionsOf`)
 * VÀ cương vị cấp dưới của nó theo sơ đồ ca trực —
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
import { normalizeText } from "@/lib/nav";

/**
 * Cương vị hành chính không đi ca nên không có mã trong danh mục vận hành, nhưng công
 * việc của họ là tổng hợp toàn phân xưởng — rào theo cương vị sẽ làm họ không thấy gì.
 * Danh sách TƯỜNG MINH, không suy đoán kiểu "không khớp danh mục thì cho xem tất".
 */
const ADMIN_VIEW_ALL_POSITION_KEYS = ["thong ke"];

function isAdminViewAllPosition(position: string) {
  const key = normalizeText(position);
  return ADMIN_VIEW_ALL_POSITION_KEYS.some((allowed) => key.includes(allowed));
}

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
 * CHỈ cương vị ĐANG LÀM VIỆC — cố ý KHÔNG gộp cương vị kiêm nhiệm.
 *
 * Nghiệp vụ chốt (2026-08-10): người kiêm nhiệm chỉ nhìn phần việc của cương vị mình
 * đang trực; muốn xem phần kiêm nhiệm thì tự chuyển cương vị đang làm việc ở trang Tài
 * khoản. Gộp cả hai làm bảng lẫn lộn hai đầu việc — test2 trực Trợ thủ nhưng vẫn thấy
 * cả khiếm khuyết FGD.
 *
 * KHÁC với phạm vi GHI của PCCC (lib/pccc-service.ts) vốn gộp mọi cương vị được gán:
 * ở đó gộp để người quên chuyển cương vị vẫn ghi được, còn ở đây thu hẹp là để nhìn
 * cho gọn. Hai luật khác nhau vì hai mục đích khác nhau, không phải bỏ sót.
 *
 * `requireUser()` đã quy `currentPosition` về đúng một cương vị hợp lệ trong số cương vị
 * được gán (`effectiveUserPosition`, lib/current-position.ts), chưa chọn thì lấy cương vị
 * chính — nên ở đây không cần dò lại danh sách.
 */
function ownPositionsOf(user: DefectPositionCarrier) {
  const active = user.currentPosition ?? user.primaryPosition ?? user.position;
  return [active].filter((value): value is string => Boolean(value && String(value).trim()));
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
 * Phạm vi xem của người đăng nhập.
 *
 * Chức danh ĐÃ khai nhưng không khớp danh mục vận hành và không nằm trong danh sách
 * hành chính ở trên → `codes` rỗng → không thấy phiếu nào. Đây là chủ ý: nhãn lạ phải
 * được sửa cho đúng danh mục chứ không được âm thầm nới thành "xem tất".
 */
export async function resolveDefectViewScope(
  user: DefectPositionCarrier
): Promise<DefectViewScope> {
  if (user.role === "ADMIN") return DEFECT_VIEW_SCOPE_ALL;
  if (await hasPermissionLevel(user, "defect-view", ["manage", "full"])) {
    return DEFECT_VIEW_SCOPE_ALL;
  }

  const positions = ownPositionsOf(user);
  if (positions.some(isUnrestrictedEquipmentPosition)) return DEFECT_VIEW_SCOPE_ALL;
  if (positions.some(isAdminViewAllPosition)) return DEFECT_VIEW_SCOPE_ALL;
  // CHƯA khai chức danh thì giữ nguyên hành vi cũ (xem toàn bộ) thay vì làm mù tài
  // khoản: rào này để phân việc theo cương vị, không phải để phạt hồ sơ thiếu dữ liệu.
  // An toàn vì chỉ ADMIN mới sửa được `position` (/api/me chặn, chỉ /api/users cho phép)
  // nên người dùng không thể tự xoá chức danh để thoát rào. Tài khoản rơi vào nhánh này
  // được đếm và báo lên giao diện để quản trị đi khai cho đủ.
  if (!positions.length) return DEFECT_VIEW_SCOPE_ALL;

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
