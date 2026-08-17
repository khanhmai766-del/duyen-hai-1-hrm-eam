// Centralized domain constants: statuses, roles, shift types, and their UI metadata.
import { normalizeText } from "@/lib/nav";
import { effectiveUserPosition, type PositionCarrier } from "@/lib/current-position";
import {
  positionAllowedForUnit,
  positionLabelsForUnit,
} from "@/lib/position-catalog";
import { parseDateInput } from "@/lib/utils";

export const REPAIR_STATUS = {
  OPEN: { label: "Mở", badge: "bg-slate-100 text-slate-700", dot: "#64748B", step: 0 },
  IN_PROGRESS: { label: "Đang xử lý", badge: "bg-blue-100 text-blue-800", dot: "#2563EB", step: 1 },
  WAITING_PARTS: { label: "Chờ vật tư", badge: "bg-amber-100 text-amber-800", dot: "#D97706", step: 2 },
  RESOLVED: { label: "Đã khắc phục", badge: "bg-green-100 text-green-800", dot: "#16A34A", step: 3 },
  CLOSED: { label: "Đã đóng", badge: "bg-gray-100 text-gray-600", dot: "#6B7280", step: 4 },
} as const;

export type RepairStatusKey = keyof typeof REPAIR_STATUS;
export const REPAIR_STATUS_ORDER: RepairStatusKey[] = ["OPEN", "IN_PROGRESS", "WAITING_PARTS", "RESOLVED", "CLOSED"];

export const PRIORITY = {
  LOW: { label: "Thấp", badge: "bg-gray-100 text-gray-700" },
  MEDIUM: { label: "Trung bình", badge: "bg-blue-100 text-blue-800" },
  HIGH: { label: "Cao", badge: "bg-amber-100 text-amber-800" },
  CRITICAL: { label: "Nghiêm trọng", badge: "bg-red-100 text-red-800" },
} as const;

export type PriorityKey = keyof typeof PRIORITY;
export const PRIORITY_ORDER: PriorityKey[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export const ROLES = {
  ADMIN: { label: "Quản trị", badge: "bg-navy text-white" },
  MANAGER: { label: "Quản lý", badge: "bg-indigo-600 text-white" },
  SUPERVISOR: { label: "Trưởng ca", badge: "bg-accent text-white" },
  TECHNICIAN: { label: "Kỹ thuật viên", badge: "bg-secondary text-white" },
  VIEWER: { label: "Người xem", badge: "bg-gray-200 text-gray-700" },
} as const;

export type RoleKey = keyof typeof ROLES;

export const SHIFT_TYPE = {
  MORNING: { label: "Sáng", short: "V1", color: "#FDE68A", text: "#92400E" },
  AFTERNOON: { label: "Chiều", short: "V2", color: "#BFDBFE", text: "#1E40AF" },
  NIGHT: { label: "Đêm", short: "V3", color: "#C7D2FE", text: "#3730A3" },
} as const;

export type ShiftTypeKey = keyof typeof SHIFT_TYPE;
export const SHIFT_TYPE_ORDER: ShiftTypeKey[] = ["MORNING", "AFTERNOON", "NIGHT"];

/**
 * Real-time shift by clock:
 *  06:00–14:00 → Ca Sáng (MORNING)
 *  14:00–22:00 → Ca Chiều (AFTERNOON)
 *  22:00–06:00 → Ca Đêm (NIGHT)
 */
export function currentShiftType(d: Date = new Date()): ShiftTypeKey {
  const h = d.getHours();
  if (h >= 6 && h < 14) return "MORNING";
  if (h >= 14 && h < 22) return "AFTERNOON";
  return "NIGHT";
}

/**
 * The shift currently in progress + the calendar date it belongs to. The night
 * shift crosses midnight, so 00:00–05:59 maps to the PREVIOUS day's night shift.
 */
export function realtimeShift(now: Date = new Date()): { date: string; shiftType: ShiftTypeKey } {
  const h = now.getHours();
  const d = new Date(now);
  let shiftType: ShiftTypeKey;
  if (h >= 6 && h < 14) shiftType = "MORNING";
  else if (h >= 14 && h < 22) shiftType = "AFTERNOON";
  else {
    shiftType = "NIGHT";
    if (h < 6) d.setDate(d.getDate() - 1);
  }
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { date, shiftType };
}

/**
 * Khung giờ của một ca trực (start/end datetime) theo ngày + loại ca:
 *  Sáng  06:00–14:00 · Chiều 14:00–22:00 · Đêm 22:00 → 06:00 hôm sau.
 * Dùng để xác định ca đã kết thúc hay chưa (reset card cương vị, đếm ca sớm).
 */
export function shiftWindow(date: Date | string, shiftType: string): { start: Date; end: Date } {
  const d = parseDateInput(date);
  d.setHours(0, 0, 0, 0);
  const at = (base: Date, h: number) => {
    const x = new Date(base);
    x.setHours(h, 0, 0, 0);
    return x;
  };
  if (shiftType === "MORNING") return { start: at(d, 6), end: at(d, 14) };
  if (shiftType === "AFTERNOON") return { start: at(d, 14), end: at(d, 22) };
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  return { start: at(d, 22), end: at(next, 6) };
}

/** Số ca trực được phép điểm danh sớm (đặt trước) tối đa cho mỗi user. */
export const MAX_EARLY_CHECKINS = 15;

export const OPERATION_TYPE = {
  DRILL_INCIDENT: { label: "Diễn tập sự cố", badge: "bg-amber-100 text-amber-800", dot: "#D97706" },
  DRILL_FIRE: { label: "Diễn tập PCCC", badge: "bg-red-100 text-red-800", dot: "#DC2626" },
  OTHER: { label: "Hoạt động khác", badge: "bg-blue-100 text-blue-800", dot: "#2563EB" },
} as const;

export type OperationTypeKey = keyof typeof OPERATION_TYPE;
export const OPERATION_TYPE_ORDER: OperationTypeKey[] = ["DRILL_INCIDENT", "DRILL_FIRE", "OTHER"];

export const CHECKIN_STATUS = {
  PRESENT: { label: "Có mặt", badge: "bg-green-100 text-green-800" },
  LATE: { label: "Đi muộn", badge: "bg-amber-100 text-amber-800" },
  ABSENT: { label: "Vắng", badge: "bg-red-100 text-red-800" },
} as const;

// ---- Khiếm khuyết thiết bị (Defect) ----

export const DEFECT_UNITS = ["S1", "S2", "COMMON"] as const;
export type DefectUnit = (typeof DEFECT_UNITS)[number];

/**
 * Dropdown Cương vị trong form khiếm khuyết theo từng Tổ máy.
 * So khớp với danh sách cương vị thực tế bằng normalizeText (bỏ qua hoa/thường & dấu),
 * nên chính tả ở đây chỉ mang tính tham chiếu. S1/S2 dùng chung một nhóm vị trí vận hành.
 */
export const DEFECT_UNIT_POSITIONS: Record<DefectUnit, readonly string[]> = {
  S1: positionLabelsForUnit("S1"),
  S2: positionLabelsForUnit("S2"),
  COMMON: positionLabelsForUnit("COMMON"),
};

export const DEFECT_COMMON_POSITIONS = [
  ...DEFECT_UNIT_POSITIONS.COMMON,
] as const;

export function isPositionAllowedForDefectUnit(unit: string | null | undefined, position: string) {
  return positionAllowedForUnit(unit, position);
}

/** Khi Tổ máy = COMMON, Sheet còn phân biệt BOP | CHUNG | ĐKTT. */
export const DEFECT_COMMON_SUB_UNITS = ["BOP", "CHUNG", "ĐKTT"] as const;
export type DefectCommonSubUnit = (typeof DEFECT_COMMON_SUB_UNITS)[number];

/** Mức độ khiếm khuyết (1–4). */
export const DEFECT_SEVERITY = {
  "1": "1 - Ảnh hưởng hệ số đáp ứng",
  "2": "2 - Ảnh hưởng công suất",
  "3": "3 - Hư hỏng xếp chồng, ảnh hưởng công suất",
  "4": "4 - Không hư hỏng xếp chồng, ảnh hưởng công suất",
} as const;
export const DEFECT_SEVERITY_ORDER = ["1", "2", "3", "4"] as const;

/** Tiêu chí chi tiết để phân loại mức độ khiếm khuyết. ID ổn định để lưu trên phiếu. */
export const DEFECT_SEVERITY_CRITERIA = {
  "1": {
    title: "Mức ưu tiên cao nhất, xử lý khẩn cấp",
    guidance: "Áp dụng đối với các khiếm khuyết có ảnh hưởng trực tiếp, nghiêm trọng đến vận hành tổ máy, an toàn, môi trường hoặc theo chỉ đạo của Ban Giám đốc.",
    options: [
      { id: "1a", label: "Ảnh hưởng đến hệ số đáp ứng hoặc trực tiếp đến công suất tổ máy." },
      { id: "1b", label: "Ảnh hưởng trực tiếp đến các thông số môi trường (khí thải, nước thải) hoặc áp suất nước PCCC." },
      { id: "1c", label: "Xỉ than, xỉ tro, rò rỉ hóa chất phát tán rộng; có nguy cơ mất an toàn vận hành hoặc ảnh hưởng môi trường." },
      { id: "1d", label: "Hư hỏng gây bất khả dụng máy phát Diesel." },
      { id: "1e", label: "Liên quan đến hệ thống bảo vệ, liên động, điều khiển chính quan trọng của tổ máy." },
      { id: "1f", label: "Phiếu yêu cầu thực hiện theo chỉ đạo của Ban Giám đốc." },
    ],
  },
  "2": {
    title: "Mức ưu tiên cao, xử lý sớm không để kéo dài",
    guidance: "Áp dụng đối với các khiếm khuyết ảnh hưởng đến công suất, độ khả dụng, độ tin cậy nhưng chưa gây ảnh hưởng trực tiếp, tức thời như Mức 1.",
    options: [
      { id: "2a", label: "Phiếu yêu cầu mức thấp bị nhắc lại từ 2 lần trở lên (từ 7–30 ngày kể từ ngày ra phiếu, tùy mức độ)." },
      { id: "2b", label: "Suy giảm khả năng dự phòng của thiết bị hoặc hệ thống quan trọng." },
      { id: "2c", label: "Có nguy cơ ảnh hưởng đến công suất hoặc độ khả dụng nếu không xử lý kịp thời." },
      { id: "2d", label: "Thiết bị phụ trợ quan trọng vận hành không ổn định, thông số bất thường nhưng vẫn trong giới hạn cho phép." },
      { id: "2e", label: "Xỉ than, xỉ tro, rò rỉ hóa chất ở mức cục bộ; ảnh hưởng vệ sinh công nghiệp và có nguy cơ ảnh hưởng thiết bị lân cận." },
      { id: "2f", label: "Khiếm khuyết có xu hướng lặp lại, kéo dài hoặc phát triển xấu hơn." },
      { id: "2g", label: "Ảnh hưởng trực tiếp suất hao nhiệt (SHN) hoặc các lỗi PCCC không thuộc Mức 1." },
    ],
  },
  "3": {
    title: "Mức ưu tiên trung bình, xử lý theo kế hoạch",
    guidance: "Áp dụng đối với khiếm khuyết chưa ảnh hưởng trực tiếp đến công suất và độ khả dụng, nhưng có nguy cơ gây hư hỏng xếp chồng hoặc làm suy giảm tình trạng thiết bị.",
    options: [
      { id: "3a", label: "Có nguy cơ gây hư hỏng lan truyền hoặc xếp chồng." },
      { id: "3b", label: "Hư hỏng nhỏ, rò rỉ nhỏ, bất thường cục bộ chưa ảnh hưởng ngay đến vận hành." },
      { id: "3c", label: "Ảnh hưởng đến tuổi thọ, độ bền hoặc tình trạng kỹ thuật thiết bị." },
      { id: "3d", label: "Tồn tại cần đưa vào kế hoạch xử lý trong các đợt dừng máy phù hợp." },
    ],
  },
  "4": {
    title: "Mức ưu tiên thấp, theo dõi cải tiến khi có điều kiện",
    guidance: "Áp dụng đối với các tồn tại không ảnh hưởng và không có nguy cơ xếp chồng đến công suất, độ khả dụng.",
    options: [
      { id: "4a", label: "Mang tính hoàn thiện, chỉnh trang hoặc mỹ quan công nghiệp." },
      { id: "4b", label: "Không ảnh hưởng đến an toàn, môi trường, công suất và độ tin cậy vận hành." },
      { id: "4c", label: "Có thể theo dõi và xử lý khi có điều kiện phù hợp về vật tư, nhân lực hoặc lịch sửa chữa." },
    ],
  },
} as const;

export function normalizeDefectSeverityCriteria(severity: unknown, value: unknown): string[] {
  const level = String(severity ?? "") as keyof typeof DEFECT_SEVERITY_CRITERIA;
  const config = DEFECT_SEVERITY_CRITERIA[level];
  if (!config || !Array.isArray(value)) return [];
  const allowed = new Set<string>(config.options.map((option) => option.id));
  return Array.from(new Set(value.map(String).filter((id) => allowed.has(id))));
}

/** Nhãn các tiêu chí chi tiết đã chọn; trả [] để giao diện dùng tên mức chung. */
export function defectSeverityCriteriaLabels(severity: unknown, value: unknown): string[] {
  const level = String(severity ?? "") as keyof typeof DEFECT_SEVERITY_CRITERIA;
  const config = DEFECT_SEVERITY_CRITERIA[level];
  if (!config) return [];
  const selected = new Set(normalizeDefectSeverityCriteria(level, value));
  return config.options
    .filter((option) => selected.has(option.id))
    .map((option) => option.label);
}

/** Điều kiện thực hiện. */
export const DEFECT_CONDITION = {
  A: "A - Cần ngừng máy",
  B: "B - Không cần ngừng",
} as const;
export const DEFECT_CONDITION_ORDER = ["A", "B"] as const;

/** Loại yêu cầu (chuyên môn). */
// Danh sách đầy đủ cho form nhập. Bộ lọc của trang Khiếm khuyết KHÔNG dùng hằng này
// mà lấy theo từng phần Cơ/Điện — xem lib/defect-section.ts.
export const DEFECT_REQUEST_TYPES = ["Cơ", "Điện", "Môi Trường", "Hóa", "Hành Chính IT", "Khác"] as const;

/** Khối quản lý — suy ra từ cương vị quản lý theo quy tắc nghiệp vụ. */
export const EQUIPMENT_BLOCKS = ["Khối Lò Hơi", "Khối Turbine", "Khối BOP", "Khối Điện", "Khối I&C"] as const;
const BLOCK_LO_POSITIONS = ["lò trưởng", "lò phó", "máy nghiền", "thải xỉ", "esp", "fgd"];
const BLOCK_TURBINE_POSITIONS = ["máy trưởng", "máy phó", "trợ thủ", "trạm bơm tuần hoàn"];
const BLOCK_DIEN_POSITIONS = ["trưởng kíp điện", "trực chính điện", "trực phụ điện"];
const BLOCK_IC_POSITIONS = ["thiết bị đo lường điều khiển", "i&c"];
// Khối BOP — danh sách tường minh (KHÔNG còn là mặc định cho phần còn lại).
const BLOCK_BOP_POSITIONS = ["khí nén", "nh3", "trạm bơm nước thô", "xln"];

/**
 * Khối quản lý theo cương vị (so khớp không phân biệt hoa/thường & dấu, theo chứa từ khoá):
 *  - Lò Trưởng/Lò Phó/Máy Nghiền/Thải Xỉ/ESP/FGD → Khối Lò Hơi
 *  - Máy Trưởng/Máy Phó/Trợ Thủ/Trạm Bơm Tuần Hoàn → Khối Turbine
 *  - Trưởng kíp điện/Trực chính điện/Trực phụ điện → Khối Điện
 *  - Thiết bị đo lường điều khiển / I&C → Khối I&C
 *  - Khí Nén – Nhà Dầu / NH3 - Lò hơi phụ / Trạm bơm nước thô / XLN hỗn hợp / XLNT → Khối BOP
 *  - còn lại (Trưởng ca, TK Lò máy, cương vị khác…) → không thuộc khối nào (trả về "")
 */
export function blockForPosition(position?: string | null): string {
  if (!position) return "";
  const p = normalizeText(position);
  if (BLOCK_LO_POSITIONS.some((k) => p.includes(normalizeText(k)))) return "Khối Lò Hơi";
  if (BLOCK_TURBINE_POSITIONS.some((k) => p.includes(normalizeText(k)))) return "Khối Turbine";
  if (BLOCK_DIEN_POSITIONS.some((k) => p.includes(normalizeText(k)))) return "Khối Điện";
  if (BLOCK_IC_POSITIONS.some((k) => p.includes(normalizeText(k)))) return "Khối I&C";
  if (BLOCK_BOP_POSITIONS.some((k) => p.includes(normalizeText(k)))) return "Khối BOP";
  return "";
}

/**
 * Cương vị cấp quản lý/hành chính — KHÔNG hiện trong ô chọn "Cương vị quản lý"
 * ở mục Quản lý thiết bị & Quản lý tài liệu số. So khớp không phân biệt hoa/thường
 * & dấu, theo chứa từ khoá (loại cả biến thể, vd "Quản đốc phân xưởng", "Kỹ thuật viên I&C").
 */
const EXCLUDED_MANAGING_POSITION_KEYS = ["quan doc", "ky thuat vien", "thong ke"];
export function isSelectableManagingPosition(position?: string | null): boolean {
  if (!position) return false;
  const p = normalizeText(position);
  return !EXCLUDED_MANAGING_POSITION_KEYS.some((k) => p.includes(k));
}

/** Tình trạng khiếm khuyết. */
export const DEFECT_STATUS = {
  CHUA_XU_LY: { label: "Chưa xử lý", badge: "bg-slate-100 text-slate-700", dot: "#64748B" },
  CO_PCT: { label: "Đang thực hiện", badge: "bg-blue-100 text-blue-800", dot: "#2563EB" },
  CHO_VAT_TU: { label: "Chờ vật tư", badge: "bg-amber-100 text-amber-800", dot: "#D97706" },
  CHO_NGUNG_MAY: { label: "Chờ ngừng máy", badge: "bg-orange-100 text-orange-800", dot: "#EA580C" },
  DA_XU_LY: { label: "Đã xử lý", badge: "bg-green-100 text-green-800", dot: "#16A34A" },
} as const;
export type DefectStatusKey = keyof typeof DEFECT_STATUS;
export const DEFECT_STATUS_ORDER: DefectStatusKey[] = ["CHUA_XU_LY", "CO_PCT", "CHO_VAT_TU", "CHO_NGUNG_MAY", "DA_XU_LY"];

/** Loại vật tư — dùng cho tab phân loại trong Danh mục vật tư. */
export const MATERIAL_CATEGORIES = [
  "Dầu bôi trơn",
  "Lõi lọc dầu",
  "Thiết bị C&I",
  "Hóa Chất",
  // Chai khí (CO2, N2) tách khỏi Hóa Chất từ 2026-08: cùng là vật tư tiêu hao nhưng
  // theo dõi theo CHAI (đếm vỏ, đổi vỏ) chứ không theo khối lượng tiêu thụ, nên gộp
  // chung một danh mục thì hai lối theo dõi lẫn vào nhau.
  "Chai Khí",
  "Bi Nghiền Than",
  "Văn phòng phẩm",
  // "Khác" luôn đứng cuối: đây là chỗ chứa những thứ chưa có nhóm riêng, không phải một
  // loại ngang hàng với các loại trên.
  "Khác",
] as const;

/** Nhãn hiển thị loại vật tư. Giữ nguyên giá trị lưu trữ để tương thích dữ liệu,
 *  nhưng thống nhất cách gọi ngắn gọn trên toàn bộ giao diện. */
export function displayMaterialCategory(category: string): string {
  return category === "Lõi lọc dầu" || category === "Lọc dầu" ? "Lõi lọc" : category;
}

/** So khớp loại vật tư với tab Danh mục — chấp nhận cả nhãn cũ còn trong dữ liệu
 *  ("Hóa chất"/"Vật tư tiêu hao" → Hóa Chất; "Bi nghiền"/"Bi nghiền than" → Bi Nghiền Than). */
export function materialCategoryMatches(value: string | null | undefined, target: string): boolean {
  return (
    value === target ||
    (target === "Hóa Chất" && (value === "Vật tư tiêu hao" || value === "Hóa chất")) ||
    (target === "Chai Khí" && value === "Chai khí") ||
    (target === "Bi Nghiền Than" && (value === "Bi nghiền than" || value === "Bi nghiền"))
  );
}

/** Loại vật tư luôn thuộc phần Cơ — SYC thay thế của các loại này mặc định ghi
 *  vào Sheet Cơ, người lập vẫn đổi lại được nếu cần. */
export const MECHANICAL_MATERIAL_CATEGORIES = ["Dầu bôi trơn", "Lõi lọc dầu", "Bi Nghiền Than"] as const;

/** Loại yêu cầu gợi ý sẵn theo loại vật tư; rỗng = để người lập tự chọn. */
export function defaultRequestTypeForMaterialCategory(category: string | null | undefined): string {
  return MECHANICAL_MATERIAL_CATEGORIES.some((target) => materialCategoryMatches(category, target)) ? "Cơ" : "";
}

/** Ánh xạ loại vật tư của PHIẾU thay thế (materialCategory) → loại trong Danh mục
 *  vật tư (Material.category): dùng để lọc dropdown vật tư ở bước Đề xuất/Nhập liệu. */
export const TICKET_TO_MATERIAL_CATEGORY: Record<string, string> = {
  "Dầu bôi trơn": "Dầu bôi trơn",
  "Lọc dầu": "Lõi lọc dầu",
  "Hóa chất": "Hóa Chất",
  "Chai khí": "Chai Khí",
  "Bi nghiền": "Bi Nghiền Than",
  "Văn phòng phẩm": "Văn phòng phẩm",
  "Khác": "Khác",
};

/** Loại vật tư chọn được khi lập PHIẾU vật tư. Khác cách viết với `MATERIAL_CATEGORIES`
 *  (nhãn trên phiếu ngắn hơn) nên phải đi qua `TICKET_TO_MATERIAL_CATEGORY` để tra Danh mục. */
export const TICKET_MATERIAL_CATEGORIES = [
  "Dầu bôi trơn",
  "Lọc dầu",
  "Hóa chất",
  "Chai khí",
  "Bi nghiền",
  "Văn phòng phẩm",
  "Khác",
] as const;

/**
 * Vật tư MUA THEO LÔ (hóa chất, chai khí): số lượng đề xuất KHÔNG bị chặn bởi tồn ERP,
 * và không bao giờ đi luồng "Sử dụng hiện có" — kho thường về 0 giữa hai lần nhập nên
 * chặn theo tồn chỉ khoá phiếu lại chứ không phản ánh thực tế.
 *
 * Đây thuần tuý là quy tắc về TỒN KHO; các bước đi qua thì mỗi loại một khác:
 * hóa chất xem `CHEMICAL_TICKET_TYPE`, chai khí xem `isGasCylinderTicket`.
 */
export function isChemicalFlowTicket(materialCategory: string | null | undefined): boolean {
  return materialCategory === "Hóa chất" || materialCategory === "Chai khí";
}

/**
 * LUỒNG CHAI KHÍ (chốt 2026-08-17) — vẫn chọn Đề xuất hoặc Ứng như vật tư thường,
 * nhưng BỎ nghiệm thu (không có BBNT) và BỎ quyết toán, thay bằng bước cuối XÁC NHẬN TRẢ:
 * chai khí lãnh về là đổi vỏ, dùng xong phải trả vỏ rỗng về kho.
 *
 *   Đề xuất: tạo → TC/TK xác nhận → Thống kê xác nhận ĐXVT → xác nhận lãnh
 *            → xác nhận sử dụng → xác nhận trả
 *   Ứng:     tạo → TC/TK xác nhận → xác nhận lãnh → Thống kê xác nhận ĐXVT
 *            → xác nhận sử dụng → xác nhận trả
 *
 * `MaterialTicket.type` vẫn là DE_XUAT / UNG — luồng chai khí là BIẾN THỂ của hai luồng đó,
 * không phải loại phiếu thứ ba; tách type riêng sẽ phải sửa lại mọi nơi đang lọc theo type.
 */
export function isGasCylinderTicket(materialCategory: string | null | undefined): boolean {
  return materialCategory === "Chai khí";
}

/** Trạng thái bước cuối của luồng chai khí: chờ VHV xác nhận đã trả vỏ chai về kho. */
export const GAS_RETURN_STATUS = "CHO_TRA_VO";

/**
 * VẬT TƯ KHAI MỘT BƯỚC: lập phiếu xong là hết, không đi tiếp lãnh — sử dụng — nghiệm thu —
 * quyết toán. NH3 lỏng bơm thẳng từ xe bồn vào bồn chứa hệ thống SCR: không có việc "lãnh
 * vật tư" hay "nghiệm thu" cho từng phiếu, phiếu chỉ để GHI NHẬN lượng đã dùng vào sổ theo dõi.
 *
 * Khoá theo MÃ vật tư chứ không theo tên: tên gọi trong danh mục còn sửa được (đang là
 * "Hóa chât NH3 lỏng" — sai chính tả), mã ERP thì không.
 */
export const SINGLE_STEP_TICKET_MATERIAL_CODES = ["1.61.16.003.VIE.00.000"] as const;

/** Giá trị `MaterialTicket.type` của phiếu khai một bước. */
export const SINGLE_STEP_TICKET_TYPE = "GHI_NHAN";

/**
 * LUỒNG HÓA CHẤT (3 bước) — áp cho mọi hóa chất trừ NH3 lỏng (NH3 khai một bước):
 *
 *   1. VHV tạo đề xuất
 *   2. Thống kê HOẶC Kỹ thuật viên xác nhận đề xuất — chốt lịch giao hàng + khối lượng giao
 *   3. VHV xác nhận khối lượng lãnh — khối lượng, ngày lãnh, người lãnh → hoàn tất
 *
 * Bỏ bước Trưởng ca/Trưởng kíp xác nhận và cả cụm sử dụng — nghiệm thu — quyết toán: hóa chất
 * bơm thẳng vào bồn của hệ thống, không có biên bản nghiệm thu cho từng lần giao.
 */
export const CHEMICAL_TICKET_TYPE = "HOA_CHAT";

/**
 * LÝ DO ĐỀ XUẤT — chọn từ danh sách, đặt ở đây vì MÁY CHỦ cũng phải biết: lý do quyết
 * định phiếu có biên bản thu hồi vật tư hay không.
 */
export const TICKET_REASONS = ["Bổ sung", "Thay thế", "Nhập", "Khác"] as const;
export const TICKET_REASON_OTHER = "Khác";

/**
 * Hóa chất và chai khí mua theo lô về kho rồi dùng dần, không gắn với một điểm thay thế
 * cụ thể trên thiết bị — "Bổ sung" và "Thay thế" không có nghĩa ở đây (và "Thay thế" còn
 * kéo theo biên bản thu hồi vật tư mà hai loại này không dùng). Lý do chỉ còn Nhập / Khác.
 */
export const BULK_TICKET_REASONS = ["Nhập", "Khác"] as const;

/** Danh sách lý do chọn được theo loại vật tư của phiếu. */
export function ticketReasonsFor(materialCategory: string | null | undefined): readonly string[] {
  return isChemicalFlowTicket(materialCategory) ? BULK_TICKET_REASONS : TICKET_REASONS;
}

/** Lý do đã nhập có hợp lệ với loại vật tư không — dùng chung cho giao diện và máy chủ. */
export function ticketReasonAllowed(
  materialCategory: string | null | undefined,
  proposalNote: string | null | undefined,
): boolean {
  const raw = (proposalNote ?? "").trim();
  if (!raw) return true; // chỗ khác đã bắt buộc nhập; ở đây chỉ xét lý do có bị cấm không
  const allowed = ticketReasonsFor(materialCategory);
  if (allowed === TICKET_REASONS) return true;
  // Phiếu cũ gõ tay không khớp lựa chọn nào thì coi như "Khác" — không chặn dữ liệu cũ.
  const choice = TICKET_REASONS.find((item) => raw === item || raw.startsWith(`${item}:`));
  return !choice || (allowed as readonly string[]).includes(choice);
}
export const TICKET_REASON_REPLACEMENT = "Thay thế";
export const TICKET_REASON_RENEWAL = "Thay mới";

/**
 * Lý do "Thay thế" ⇒ LUÔN có biên bản thu hồi vật tư (BBTHVT): thay cái mới vào thì có
 * cái cũ phải thu về. Các lý do còn lại (Bổ sung, Nhập, Khác) không sinh vật tư thu hồi.
 *
 * Suy từ lý do thay vì hỏi lại ở bước sử dụng: câu hỏi đó vừa thừa vừa dễ trả lời sai
 * (đã bỏ ở commit 24b393a).
 */
export function reasonRequiresRecovery(proposalNote?: string | null): boolean {
  const reason = normalizeText(proposalNote ?? "").trim();
  const replacementReasons = [TICKET_REASON_REPLACEMENT, TICKET_REASON_RENEWAL]
    .map((item) => normalizeText(item));
  return replacementReasons.some((item) => reason === item || reason.startsWith(`${item}:`));
}

/** Một số điểm dùng vật tư vẫn phải thu hồi khi châm/bổ sung (ví dụ dầu EA máy nghiền). */
export function isSupplementReason(proposalNote?: string | null): boolean {
  const reason = normalizeText(proposalNote ?? "").trim();
  const supplement = normalizeText(TICKET_REASONS[0]);
  return reason === supplement || reason.startsWith(`${supplement}:`);
}

export function recoveryRequiredForReason(
  proposalNote?: string | null,
  recoveryOnSupplement = false,
): boolean {
  return reasonRequiresRecovery(proposalNote)
    || (recoveryOnSupplement && isSupplementReason(proposalNote));
}

/** Dùng snapshot trên phiếu; chỉ suy từ lý do cho dữ liệu cũ chưa có snapshot.
 *  Chai khí luôn KHÔNG có BBTHVT: việc trả vỏ đã thành một bước riêng trong luồng
 *  (xem `isGasCylinderTicket`), hỏi thêm ở bước Sử dụng là bắt khai hai lần. */
export function materialTicketRequiresRecovery(ticket: {
  recoveryRequired?: boolean | null;
  proposalNote?: string | null;
  materialCategory?: string | null;
}): boolean {
  if (isGasCylinderTicket(ticket.materialCategory)) return false;
  return ticket.recoveryRequired ?? reasonRequiresRecovery(ticket.proposalNote);
}

/** Loại vật tư của PHIẾU đi theo luồng hóa chất 3 bước. */
export function isChemicalWorkflowCategory(materialCategory: string | null | undefined): boolean {
  return materialCategory === "Hóa chất";
}

export function isSingleStepTicketMaterial(materialCode: string | null | undefined): boolean {
  return !!materialCode && (SINGLE_STEP_TICKET_MATERIAL_CODES as readonly string[]).includes(materialCode);
}

/** Ai được THAO TÁC Danh mục vật tư (thêm/sửa/xoá/xuất): Quản trị (ADMIN),
 *  Kỹ thuật viên (role TECHNICIAN hoặc chức vụ), Quản đốc / Phó Quản đốc.
 *  Xem nội dung bảng thì mọi cương vị đều được. */
export function canManageMaterialCatalog(user: PositionCarrier & { role?: string | null }): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role === "TECHNICIAN") return true;
  // TỰ quy về cương vị ĐANG TRỰC thay vì tin vào trường `position` nơi gọi truyền xuống:
  // phiên đăng nhập phía trình duyệt mang `position` là CHỨC DANH GỐC, lấy thẳng là giao diện
  // ra kết quả khác máy chủ (máy chủ luôn xét cương vị đang trực).
  const p = normalizeText(effectiveUserPosition(user) ?? user.position ?? "");
  return p.includes("quan doc") || p.includes("ky thuat vien");
}

// ---- Tiện ích thời gian dùng chung ----

/**
 * LÀM TRÒN Ô "HIỆN CÓ" (số đếm thực tế tại kho): từ .5 trở lên lên, dưới .5 xuống.
 * 4.5 → 5, 4.6 → 5, 4.4 → 4, 4.2 → 4.
 *
 * Kho đếm theo can, theo phýy chứ không đong lẻ từng phần lít, nên số lẻ chỉ sinh ra từ phép
 * chia hoặc từ số gốc ERP. Cột lưu trong CSDL cũng là số nguyên, không làm tròn thì Prisma
 * ném lỗi khi ghi 4.5 — người dùng chỉ thấy "lưu thất bại" mà không hiểu vì sao.
 */
export function roundStock(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/** Số ngày còn lại đến hạn (âm = đã quá hạn). */
export function daysUntilDue(nextDueAt: Date | string, now: Date = new Date()): number {
  const due = new Date(nextDueAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000);
}

/** Cộng số ngày vào một mốc thời gian, giữ giờ 08:00 cho ngày đến hạn. */
export function addDays(base: Date | string, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(8, 0, 0, 0);
  return d;
}

/** Cộng số tháng vào một mốc thời gian (giữ giờ 08:00). */
export function addMonths(base: Date | string, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  d.setHours(8, 0, 0, 0);
  return d;
}

// ---- Cảnh báo thay thế vật tư (Material replacement) ----

/** Gửi cảnh báo khi còn ≤ số ngày này trước hạn thay thế (≈ 1 tháng). */
export const REPLACEMENT_WARN_DAYS = 30;

/**
 * Trạng thái đến hạn thay thế của một điểm thay thế vật tư:
 *  OVERDUE  — đã quá hạn
 *  DUE_SOON — còn ≤ REPLACEMENT_WARN_DAYS ngày (vào diện cảnh báo)
 *  OK       — còn xa hạn
 */
export const REPL_DUE = {
  OVERDUE: { label: "Quá hạn", badge: "bg-red-100 text-red-800", dot: "#DC2626" },
  DUE_SOON: { label: "Sắp đến hạn", badge: "bg-amber-100 text-amber-800", dot: "#D97706" },
  OK: { label: "Còn hạn", badge: "bg-green-100 text-green-800", dot: "#16A34A" },
} as const;

/**
 * Cùng ba mốc thời gian như REPL_DUE nhưng dành cho điểm CHỈ LẤY MẪU định kỳ:
 * tông xanh dương và chữ theo nghiệp vụ lấy mẫu, để không lẫn với vật tư quá
 * hạn thay thế (vốn là cảnh báo nghiêm trọng hơn).
 */
export const SAMPLING_DUE = {
  OVERDUE: { label: "Trễ kỳ lấy mẫu", badge: "bg-sky-100 text-sky-800", dot: "#0284C7" },
  DUE_SOON: { label: "Sắp tới kỳ lấy mẫu", badge: "bg-sky-50 text-sky-700", dot: "#38BDF8" },
  OK: { label: "Trong kỳ", badge: "bg-slate-100 text-slate-600", dot: "#94A3B8" },
} as const;

export type ReplDueKey = keyof typeof REPL_DUE;
export const REPL_DUE_ORDER: ReplDueKey[] = ["OVERDUE", "DUE_SOON", "OK"];

export const MATERIAL_MACHINE_TONES = {
  S1: {
    chip: "bg-emerald-600 text-white hover:bg-emerald-700",
    accent: "#059669",
    wash: "rgba(5,150,105,0.07)",
  },
  S2: {
    chip: "bg-fuchsia-600 text-white hover:bg-fuchsia-700",
    accent: "#c026d3",
    wash: "rgba(192,38,211,0.07)",
  },
  COMMON: {
    chip: "bg-[#d6b48a] text-[#3f2a1d] hover:bg-[#c9a274]",
    accent: "#d6b48a",
    wash: "rgba(214,180,138,0.14)",
  },
} as const;

export function materialMachineTone(machine?: string | null) {
  if (machine === "S1" || machine === "S2") return MATERIAL_MACHINE_TONES[machine];
  return MATERIAL_MACHINE_TONES.COMMON;
}

export function replacementDueStatus(nextDueAt: Date | string, now: Date = new Date()): ReplDueKey {
  const d = daysUntilDue(nextDueAt, now);
  if (d < 0) return "OVERDUE";
  if (d <= REPLACEMENT_WARN_DAYS) return "DUE_SOON";
  return "OK";
}

/** Nhãn chu kỳ thay thế: "12 tháng" kèm ghi chú tuỳ chọn ("· 2500h"). */
export function replacementIntervalLabel(months: number, note?: string | null): string {
  const base = months === 0 ? "Không theo dõi lịch" : `${months} tháng`;
  return note ? `${base} · ${note}` : base;
}

// RBAC capability matrix
export const CAN = {
  createRepair: ["ADMIN", "MANAGER", "SUPERVISOR", "TECHNICIAN"],
  approveRepair: ["ADMIN", "MANAGER", "SUPERVISOR"],
  approveCheckIn: ["ADMIN", "MANAGER", "SUPERVISOR"],
  manageUsers: ["ADMIN"],
  manageDevices: ["ADMIN"],
  deleteDevice: ["ADMIN"],
  manageMaterials: ["ADMIN", "MANAGER"],
  manageOperations: ["ADMIN", "MANAGER", "SUPERVISOR"],
  manageAnnouncements: ["ADMIN", "MANAGER"],
  manageReplacement: ["ADMIN", "MANAGER", "SUPERVISOR"],
  manageDefect: ["ADMIN", "MANAGER", "SUPERVISOR", "TECHNICIAN"],
} as const;

export function can(role: string | undefined, capability: keyof typeof CAN): boolean {
  if (!role) return false;
  return (CAN[capability] as readonly string[]).includes(role);
}

// Thứ tự chuẩn dùng chung cho bảng biên chế và các file Excel lịch trực ca.
export const SHIFT_POSITION_DISPLAY_ORDER = [
  "Trưởng ca",
  "TK Lò máy",
  "Lò Trưởng",
  "Lò phó",
  "Máy trưởng",
  "Trợ thủ",
  "Máy nghiền",
  "Máy phó",
  "Trạm bơm tuần hoàn",
  "Trạm bơm nước thô",
  "Trưởng kíp điện",
  "Trực chính Điện",
  "Trực phụ điện",
  "Thải xỉ",
  "ESP",
  "FGD",
  "Khí Nén – Nhà Dầu",
  "XLN hỗn hợp",
  "XLNT",
  "NH3 - Lò hơi phụ",
  "Thiết bị đo lường điều khiển",
] as const;

function positionOrderKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi");
}

export function compareShiftPositionNames(a: string, b: string) {
  const rank = (name: string) => {
    const key = positionOrderKey(name);
    const index = SHIFT_POSITION_DISPLAY_ORDER.findIndex((item) => {
      const standard = positionOrderKey(item);
      return key === standard || key.endsWith(standard) || key.includes(standard);
    });
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const difference = rank(a) - rank(b);
  return difference || a.localeCompare(b, "vi");
}
