/** Hằng số dùng chung cho nhóm "Nhập thông số độ rung" (chuyển từ ứng dụng VibraControl cũ). */

export const VIB_KINDS = ["WEEKLY", "MNK", "MILL", "TBNT", "HISTORY_XLSX"] as const;
export type VibKind = (typeof VIB_KINDS)[number];
/** Kind được phép ghi qua API nhập liệu (HISTORY_XLSX chỉ do script nhập dữ liệu cũ tạo). */
export const VIB_ENTRY_KINDS = ["WEEKLY", "MNK", "MILL", "TBNT"] as const;

export const SHIFT_IDS = ["sang", "chieu", "dem"] as const;
export type ShiftId = (typeof SHIFT_IDS)[number];
/** Ca theo giờ Việt Nam (UTC+7). Ca đêm 22:00–06:00 thuộc NGÀY BẮT ĐẦU ca. */
export const SHIFT_WINDOWS: Record<ShiftId, { label: string; start: number; end: number; hours: string }> = {
  sang: { label: "Ca sáng", start: 6, end: 14, hours: "06:00–14:00" },
  chieu: { label: "Ca chiều", start: 14, end: 22, hours: "14:00–22:00" },
  dem: { label: "Ca đêm", start: 22, end: 6, hours: "22:00–06:00 hôm sau" },
};

/** 23 cột đo, đúng thứ tự của `values`. */
export const VIB_LABELS: readonly string[] = [
  "Dòng điện Pha A (A)", "Dòng điện Pha B (A)", "Dòng điện Pha C (A)",
  "ĐC-KT Vận tốc X (mm/s)", "ĐC-KT Biên độ X (µm)", "ĐC-KT Vận tốc Y (mm/s)", "ĐC-KT Biên độ Y (µm)", "ĐC-KT Nhiệt độ (°C)",
  "ĐC-CT Vận tốc X (mm/s)", "ĐC-CT Biên độ X (µm)", "ĐC-CT Vận tốc Y (mm/s)", "ĐC-CT Biên độ Y (µm)", "ĐC-CT Nhiệt độ (°C)",
  "QB-KT Vận tốc X (mm/s)", "QB-KT Biên độ X (µm)", "QB-KT Vận tốc Y (mm/s)", "QB-KT Biên độ Y (µm)", "QB-KT Nhiệt độ (°C)",
  "QB-CT Vận tốc X (mm/s)", "QB-CT Biên độ X (µm)", "QB-CT Vận tốc Y (mm/s)", "QB-CT Biên độ Y (µm)", "QB-CT Nhiệt độ (°C)",
];
export const VIB_VALUE_COUNT = 23;
export const CURRENT_IDX = [0, 1, 2] as const;
/** Vận tốc X/Y của 4 gối (ĐC-KT, ĐC-CT, QB-KT, QB-CT). */
export const VELOCITY_IDX = [3, 5, 8, 10, 13, 15, 18, 20] as const;
export const AMPLITUDE_IDX = [4, 6, 9, 11, 14, 16, 19, 21] as const;
export const TEMP_IDX = [7, 12, 17, 22] as const;
/** 5 nhóm cột bật/tắt theo `measurementConfig` của thiết bị. */
export const MEASURE_GROUP_RANGES = [
  { key: "current", label: "Dòng điện động cơ (A)", from: 0, to: 2 },
  { key: "motorUnloaded", label: "Động cơ · gối KT (NDE)", from: 3, to: 7 },
  { key: "motorLoaded", label: "Động cơ · gối CT (DE)", from: 8, to: 12 },
  { key: "pumpFanUnloaded", label: "Quạt/bơm · gối KT (NDE)", from: 13, to: 17 },
  { key: "pumpFanLoaded", label: "Quạt/bơm · gối CT (DE)", from: 18, to: 22 },
] as const;

/** Kỳ đo (`measureGroups`). Thiết bị không khai báo ⇒ "thu5". */
export const MEASURE_GROUPS = [
  { id: "tuan1", label: "Thứ 5 tuần 1" }, { id: "tuan2", label: "Thứ 5 tuần 2" },
  { id: "tuan3", label: "Thứ 5 tuần 3" }, { id: "tuan4", label: "Thứ 5 tuần 4" },
  { id: "thu2", label: "Thứ 2 hàng tuần" }, { id: "thu3", label: "Thứ 3 hàng tuần" },
  { id: "thu4", label: "Thứ 4 hàng tuần" }, { id: "thu5", label: "Thứ 5 hàng tuần" },
  { id: "thu6", label: "Thứ 6 hàng tuần" }, { id: "thu7", label: "Thứ 7 hàng tuần" },
  { id: "chunhat", label: "Chủ nhật hàng tuần" }, { id: "hangngay", label: "Hàng ngày" },
] as const;
export const DEFAULT_MEASURE_GROUP = "thu5";

export const QUICK_NOTES = [
  "Máy dự phòng", "Ngừng sửa chữa", "Máy dừng theo phương thức vận hành", "Không tiếp cận được điểm đo", "Có tiếng ồn",
] as const;

// ---- Phân loại thiết bị cho 4 màn nhập ----
export const MNK_AREA = "Khí nén - nhà dầu 300m3";
const svc = (n: number) => `Động cơ MNK điều khiển và dịch vụ số ${n}`;
const ash = (x: string) => `Động cơ MNK vận chuyển tro bay ${x}`;
/** 14 động cơ MNK theo ca (thứ tự hiển thị trong ca). */
export const MNK_SHIFT_NAMES: Record<ShiftId, string[]> = {
  sang: [svc(1), svc(2), ash("A"), ash("B")],
  chieu: [svc(3), svc(4), ash("C"), ash("D"), ash("E")],
  dem: ["F", "G", "H", "I", "J"].map(ash),
};
export const TBNT_AREA = "Trạm nước thô";
/** Mill theo ca: chữ cái cuối tên máy → ca. */
export const MILL_LETTER_SHIFT: Record<string, ShiftId> = { A: "sang", B: "sang", C: "chieu", D: "chieu", E: "dem", F: "dem" };
export const MILL_AREA_RE = /(Máy nghiền|MILL) S([12])/i;
export const MILL_NAME_RE = /^Máy nghiền ([12])([A-F])$/i;

// ---- Ngưỡng cố định cho Mill / TBNT ----
export const MILL_VELOCITY_LIMIT = 5; // mm/s
export const MILL_DISPLACEMENT_LIMIT = 50; // µm
export const RISE_RATIO = 1.25; // +25 % so với lần trước
export const DEFAULT_ALERT = { enabled: true, vibration: 4.5, vibrationDanger: 7.1, temperature: 70, temperatureDanger: 85 };
