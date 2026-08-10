/**
 * PHẠM VI XEM DỮ LIỆU VẬN HÀNH THEO CƯƠNG VỊ — nguồn chuẩn duy nhất.
 *
 * Dùng chung cho mọi màn hình có cột "cương vị quản lý": Khiếm khuyết, Lịch sử sửa
 * chữa, Danh mục vật tư VH1, Lịch thay thế vật tư. Mỗi nghiệp vụ chỉ khác nhau ở QUYỀN
 * mở cổng "xem toàn bộ" (tham số `permissionId`) và ở CỘT chứa cương vị.
 *
 * ĐỪNG nhầm với `lib/position-system-scopes.ts` — file đó là phạm vi CÂY THIẾT BỊ
 * (PositionSystemScope, admin cấu hình từng nhánh). Hai rào GIAO nhau, không rào nào
 * thay được rào nào.
 *
 * Vì sao có file này: quyền xem trước đây bị chia làm hai luật — bản ghi CHƯA gắn thiết
 * bị thì xét cột cương vị, bản ghi ĐÃ gắn thiết bị thì chỉ xét cây thiết bị và BỎ QUA
 * cương vị. Hệ quả: Trợ thủ vẫn thấy phiếu "Máy phó S1" / "VHV TBTH" vì thiết bị của các
 * cương vị đó nằm chung nhánh cây được cấp quyền xem. Nghiệp vụ chốt (2026-08-09):
 * CƯƠNG VỊ LÀ RÀO QUYỀN ĐỘC LẬP, áp cho MỌI bản ghi.
 *
 * Ai được xem toàn bộ — thoả MỘT trong ba là đủ:
 *   - ADMIN;
 *   - `permissionId` mức manage/full — phải là quyền RIÊNG cho phạm vi xem
 *     (`defect-view`, `material-view`, `replacement-view`). TUYỆT ĐỐI không dùng các
 *     quyền `*-manage`: đo trên prod 2026-08-10 thì `defect-manage` (bị quy về
 *     `repair-edit`), `material-manage` và `replacement-manage` đều đang mở mức "manage"
 *     cho gần hết vai trò, kể cả VIEWER — gắn rào xem vào đó thì 100% tài khoản lọt cổng
 *     và rào không bao giờ có hiệu lực;
 *   - cương vị không bị giới hạn cây thiết bị (Quản đốc / Phó QĐ / KTV / Trưởng ca),
 *     vì các cương vị này không nằm trong danh mục vận hành nên không có mã để so.
 *
 * Còn lại: chỉ thấy cương vị ĐANG LÀM VIỆC (không gộp kiêm nhiệm — xem `ownPositionsOf`)
 * VÀ cương vị cấp dưới của nó theo sơ đồ ca trực; phân cấp lấy nguyên từ
 * `canViewUnmappedDefectPosition` (lib/positions.ts) nên mọi màn hình dùng đúng một luật.
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

/** Quyền mở cổng "xem toàn bộ" của từng nghiệp vụ. */
export const POSITION_SCOPE_PERMISSION = {
  defect: "defect-view",
  material: "material-view",
  replacement: "replacement-view",
} as const;

export type PositionScopeArea = keyof typeof POSITION_SCOPE_PERMISSION;

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
export type PositionViewScope = { all: boolean; codes: PositionCode[] };

export const POSITION_SCOPE_ALL: PositionViewScope = { all: true, codes: [] };

type PositionCarrier = {
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
function ownPositionsOf(user: PositionCarrier) {
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
 * Phạm vi xem của người đăng nhập trong MỘT nghiệp vụ.
 *
 * Chức danh ĐÃ khai nhưng không khớp danh mục vận hành và không nằm trong danh sách
 * hành chính ở trên → `codes` rỗng → không thấy bản ghi nào. Đây là chủ ý: nhãn lạ phải
 * được sửa cho đúng danh mục chứ không được âm thầm nới thành "xem tất".
 */
export async function resolvePositionViewScope(
  user: PositionCarrier,
  area: PositionScopeArea
): Promise<PositionViewScope> {
  if (user.role === "ADMIN") return POSITION_SCOPE_ALL;
  if (await hasPermissionLevel(user, POSITION_SCOPE_PERMISSION[area], ["manage", "full"])) {
    return POSITION_SCOPE_ALL;
  }

  const positions = ownPositionsOf(user);
  if (positions.some(isUnrestrictedEquipmentPosition)) return POSITION_SCOPE_ALL;
  if (positions.some(isAdminViewAllPosition)) return POSITION_SCOPE_ALL;
  // CHƯA khai chức danh thì giữ nguyên hành vi cũ (xem toàn bộ) thay vì làm mù tài
  // khoản: rào này để phân việc theo cương vị, không phải để phạt hồ sơ thiếu dữ liệu.
  // An toàn vì chỉ ADMIN mới sửa được `position` (/api/me chặn, chỉ /api/users cho phép)
  // nên người dùng không thể tự xoá chức danh để thoát rào.
  if (!positions.length) return POSITION_SCOPE_ALL;

  const codes = new Set<PositionCode>();
  for (const position of positions) {
    for (const code of viewableCodesFor(position)) codes.add(code);
  }
  return { all: false, codes: [...codes] };
}

/**
 * Một giá trị cương vị có được người này xem không. Nhận cả MÃ chức danh
 * (`managingPositionCode`) lẫn NHÃN tự do (`Defect.system`, `managingPosition`) —
 * `positionCodeOf` quy cả hai về cùng một mã.
 *
 * Giá trị rỗng hoặc không khớp danh mục → CHỈ người xem toàn bộ mới thấy. Bản ghi vô chủ
 * phải có người quản lý nhìn thấy để gán cương vị, nhưng không được rơi vào tay một
 * cương vị bất kỳ. Đếm số dòng bị ẩn vì lý do này bằng `unmatchedPosition`.
 */
export function canViewPosition(
  value: string | null | undefined,
  scope: PositionViewScope
) {
  if (scope.all) return true;
  const code = positionCodeOf(value);
  return code ? scope.codes.includes(code) : false;
}

/** true khi giá trị cương vị không quy được về danh mục chức danh (rỗng hoặc nhãn lạ). */
export function unmatchedPosition(value: string | null | undefined) {
  return positionCodeOf(value) === null;
}

/** Gửi xuống client để ô lọc "Cương vị" chỉ bày cương vị người dùng được xem. */
export function positionViewScopeMeta(scope: PositionViewScope) {
  return {
    all: scope.all,
    codes: scope.codes as string[],
    labels: scope.codes.map((code) => positionLabelOf(code)).sort((a, b) => a.localeCompare(b, "vi")),
  };
}
