import type { PositionCode } from "@/lib/position-catalog";

/**
 * Hằng số của module "Tồn kho hóa chất".
 *
 * Mọi con số ở đây đều lấy từ workbook nguồn
 * `exports/20260105 Theo dõi hóa chất nhập năm 2026.xlsx` và đã đối chiếu qua
 * cả 20 tab báo cáo tháng. Đặc tả: docs/ton-kho-hoa-chat-spec.md
 */

/** Quyền riêng của sổ hóa chất; không dùng chung với Danh mục Vận Hành 1. */
export const CHEMICAL_PERMISSION_ID = "chemical-inventory-manage";

/** Đơn vị lưu trữ. Mọi phép cộng chỉ được thực hiện trong cùng một đơn vị. */
export const BASE_UNITS = ["KG", "TON", "LITER"] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

export const UNIT_LABELS: Record<BaseUnit, string> = {
  KG: "kg",
  TON: "tấn",
  LITER: "lít",
};

export const ITEM_TYPES = ["CHEMICAL", "HFO", "DIESEL", "OTHER"] as const;
export type ChemicalItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Record<ChemicalItemType, string> = {
  CHEMICAL: "Hóa chất",
  HFO: "Dầu HFO",
  DIESEL: "Dầu Diesel/DO",
  OTHER: "Khác",
};

export type TrackingMode = "MONTHLY" | "DAILY";
export type ReadingKind = "DAILY" | "MONTH_END";
export type PeriodStatus = "DRAFT" | "LOCKED";

export type ReceiptSource = "MANUAL" | "SHEET_IMPORT" | "MATERIAL_TICKET" | "DAILY_LOG";

export const RECEIPT_SOURCE_LABELS: Record<ReceiptSource, string> = {
  MANUAL: "Nhập tay",
  SHEET_IMPORT: "Nhập từ Excel",
  MATERIAL_TICKET: "Từ phiếu vật tư",
  DAILY_LOG: "Từ nhật ký ngày",
};

/**
 * Bảy cột cương vị E..K của tab báo cáo tháng, đúng thứ tự trong sheet.
 *
 * Nhãn ở đây là NGUYÊN VĂN dòng 5 của sheet — giữ lại để đối chiếu khi import.
 * Nhãn hiển thị trên giao diện thì lấy từ `positionLabelOf()` để thống nhất với
 * phần còn lại của phần mềm.
 */
export const SHEET_POSITION_COLUMNS: ReadonlyArray<{
  column: string;
  sheetLabel: string;
  code: PositionCode;
}> = [
  { column: "E", sheetLabel: "Trực phụ điện", code: "ELECTRICAL_ASSISTANT_OPERATOR" },
  { column: "F", sheetLabel: "XLN Hỗn hợp", code: "MIXED_WATER_TREATMENT" },
  { column: "G", sheetLabel: "XLN Thải - ND 5000", code: "WASTEWATER_TREATMENT" },
  { column: "H", sheetLabel: "NH3 - LHP", code: "AUX_BOILER_NH3" },
  { column: "I", sheetLabel: "Trạm nước thô", code: "RAW_WATER_PUMP" },
  { column: "J", sheetLabel: "Nhà dầu 300 -MNK", code: "AIR_COMPRESSOR_OIL_HOUSE" },
  { column: "K", sheetLabel: "Máy phó", code: "TURBINE_DEPUTY" },
];

export const INVENTORY_POSITION_CODES: readonly PositionCode[] =
  SHEET_POSITION_COLUMNS.map((item) => item.code);

/** Dùng khi sheet có số nhưng không ghi cương vị nào. */
export const UNASSIGNED_POSITION = "UNASSIGNED";

export type SeedItem = {
  code: string;
  name: string;
  concentration?: string;
  itemType: ChemicalItemType;
  baseUnit: BaseUnit;
  displayUnit?: BaseUnit;
  trackingMode: TrackingMode;
  /** Dòng cố định trong tab báo cáo tháng (6..21) — giống hệt ở cả 20 tab. */
  sheetRow: number;
  /** Tab phiếu nhập tương ứng; null với nhiên liệu vì sheet không theo dõi lượng bơm vào bồn. */
  receiptSheet: string | null;
  /**
   * Cương vị NHẬN hàng mặc định. Suy từ dữ liệu thật của workbook + phiếu nhập:
   * NH3 luôn về NH3-LHP · NaClO và PAC về XLN hỗn hợp · HCl, NaOH, NH4OH về Máy phó.
   * Nhiên liệu lấy theo cương vị giữ bồn.
   */
  defaultPosition?: PositionCode;
  tankCapacity?: number;
  lowStockThreshold?: number;
};

/**
 * 16 mặt hàng, đúng dòng 6..21 của tab báo cáo tháng.
 *
 * `name` giữ đúng nhãn cột B của sheet (đã trim — bản gốc của PAC có một dấu cách
 * thừa ở cuối). Khớp khi import dùng normalizeChemicalName() nên khoảng trắng và
 * dấu tiếng Việt không ảnh hưởng.
 */
export const SEED_ITEMS: readonly SeedItem[] = [
  {
    code: "NH3_99",
    defaultPosition: "AUX_BOILER_NH3",
    name: "Dung dịch NH3 99%",
    concentration: "99%",
    itemType: "CHEMICAL",
    // Sổ tháng và hợp đồng đều tính bằng kg nên LƯU kg; nhật ký ngày quen đọc theo
    // tấn nên HIỂN THỊ tấn. Quy đổi chỉ xảy ra ở một chỗ duy nhất: convertUnit().
    baseUnit: "KG",
    displayUnit: "TON",
    trackingMode: "DAILY",
    sheetRow: 6,
    receiptSheet: "NH3",
    tankCapacity: 220_000, // 220 tấn
    lowStockThreshold: 80_000, // 80 tấn
  },
  {
    code: "NACLO_10",
    defaultPosition: "MIXED_WATER_TREATMENT",
    name: "Dung dịch NaClO 10%",
    concentration: "10%",
    itemType: "CHEMICAL",
    baseUnit: "KG",
    trackingMode: "MONTHLY",
    sheetRow: 7,
    receiptSheet: "NaClo 10%",
  },
  {
    code: "HCL_31",
    defaultPosition: "TURBINE_DEPUTY",
    name: "Dung dịch HCl 31%",
    concentration: "31%",
    itemType: "CHEMICAL",
    baseUnit: "KG",
    trackingMode: "MONTHLY",
    sheetRow: 8,
    receiptSheet: "HCl 31%",
  },
  {
    code: "NAOH_32",
    defaultPosition: "TURBINE_DEPUTY",
    name: "Dung dịch NaOH 32%",
    concentration: "32%",
    itemType: "CHEMICAL",
    baseUnit: "KG",
    trackingMode: "MONTHLY",
    sheetRow: 9,
    receiptSheet: "NaOH 32%",
  },
  {
    code: "PAC_12",
    defaultPosition: "MIXED_WATER_TREATMENT",
    name: "Dung dịch PAC 12% lỏng",
    concentration: "12%",
    itemType: "CHEMICAL",
    baseUnit: "KG",
    trackingMode: "MONTHLY",
    sheetRow: 10,
    receiptSheet: "PAC lỏng",
  },
  {
    code: "NH4OH_20",
    defaultPosition: "TURBINE_DEPUTY",
    name: "Dung dịch NH4OH 20%",
    concentration: "20%",
    itemType: "CHEMICAL",
    baseUnit: "KG",
    trackingMode: "MONTHLY",
    sheetRow: 11,
    receiptSheet: "NH4OH",
  },
  { code: "HFO_1", defaultPosition: "WASTEWATER_TREATMENT", name: "Bồn dầu HFO 1", itemType: "HFO", baseUnit: "TON", trackingMode: "MONTHLY", sheetRow: 12, receiptSheet: null },
  { code: "HFO_2", defaultPosition: "WASTEWATER_TREATMENT", name: "Bồn dầu HFO 2", itemType: "HFO", baseUnit: "TON", trackingMode: "MONTHLY", sheetRow: 13, receiptSheet: null },
  { code: "HFO_3", defaultPosition: "WASTEWATER_TREATMENT", name: "Bồn dầu HFO 3", itemType: "HFO", baseUnit: "TON", trackingMode: "MONTHLY", sheetRow: 14, receiptSheet: null },
  { code: "HFO_4", defaultPosition: "AIR_COMPRESSOR_OIL_HOUSE", name: "Bồn dầu HFO 4", itemType: "HFO", baseUnit: "TON", trackingMode: "MONTHLY", sheetRow: 15, receiptSheet: null },
  { code: "HFO_5", defaultPosition: "AIR_COMPRESSOR_OIL_HOUSE", name: "Bồn dầu HFO 5", itemType: "HFO", baseUnit: "TON", trackingMode: "MONTHLY", sheetRow: 16, receiptSheet: null },
  { code: "DIESEL_KHAN_1", defaultPosition: "ELECTRICAL_ASSISTANT_OPERATOR", name: "Mức bồn dầu Diesel khẩn 1", itemType: "DIESEL", baseUnit: "LITER", trackingMode: "MONTHLY", sheetRow: 17, receiptSheet: null },
  { code: "DIESEL_KHAN_2", defaultPosition: "ELECTRICAL_ASSISTANT_OPERATOR", name: "Mức bồn dầu Diesel khẩn 2", itemType: "DIESEL", baseUnit: "LITER", trackingMode: "MONTHLY", sheetRow: 18, receiptSheet: null },
  { code: "DIESEL_TBNT", defaultPosition: "RAW_WATER_PUMP", name: "Mức bồn dầu Diesel TBNT", itemType: "DIESEL", baseUnit: "LITER", trackingMode: "MONTHLY", sheetRow: 19, receiptSheet: null },
  { code: "DO_CHUA_CHAY", defaultPosition: "AUX_BOILER_NH3", name: "Mức bồn dầu DO chữa cháy", itemType: "DIESEL", baseUnit: "LITER", trackingMode: "MONTHLY", sheetRow: 20, receiptSheet: null },
  {
    // Sheet ghi dòng này bằng CHỮ ("794 mm (DCS), 760 mm (Local)") — là mức đo bằng
    // mm chứ không phải thể tích. Xếp OTHER để không bao giờ bị cộng vào tổng lít.
    code: "DO_LO_HOI_PHU",
    defaultPosition: "AUX_BOILER_NH3",
    name: "Mức bồn dầu DO lò hơi phụ",
    itemType: "OTHER",
    baseUnit: "LITER",
    trackingMode: "MONTHLY",
    sheetRow: 21,
    receiptSheet: null,
  },
];

/**
 * Độ dài tối đa của biển số xe nhập hàng.
 *
 * Chuẩn hóa bằng cách bỏ hết dấu gạch/chấm/khoảng trắng rồi viết hoa, nên người
 * dùng gõ "51C-214.77" hay "51C21477" đều ra cùng một giá trị 8 ký tự. Sổ Excel
 * ghi tắt hơn (chỉ 3 chữ số như 478, 269) — vẫn là biển số, chỉ là ghi thiếu.
 */
export const MAX_VEHICLE_NUMBER_LENGTH = 8;

/** Dải khối lượng thường gặp của một xe bồn NH3 (tấn) — ngoài dải thì cảnh báo. */
export const TRUCK_WEIGHT_RANGE_TON = { min: 15, max: 25 } as const;

/** Ngưỡng coi lượng dùng trong ngày là bất thường so với trung vị tháng. */
export const USAGE_OUTLIER_RATIO = { high: 1.5, low: 0.5 } as const;

/** Sai số cho phép khi so hai số lẽ ra phải bằng nhau (kg). */
export const RECONCILE_EPSILON = 0.001;

export const WARNING_CODES = [
  "MISSING_WEIGHT",
  "ACCEPTED_MISMATCH",
  "MISSING_VEHICLE",
  "DUPLICATE_VEHICLE_DAY",
  "WEIGHT_CONFLICT",
  "VEHICLE_CONFLICT",
  "CHAIN_BREAK",
  "OPENING_MISMATCH",
  "NEGATIVE_CLOSING",
  "NEGATIVE_CONSUMED",
  "OVER_CAPACITY",
  "LOW_STOCK",
  "USAGE_OUTLIER",
  "TRUCK_WEIGHT_OUTLIER",
  "RECEIPT_WITHOUT_PERIOD",
  "MONTH_END_INCOMPLETE",
  "PERIOD_GAP",
  "UNIT_MISMATCH",
  "INVALID_PERIOD",
  "INVALID_RECEIPT_DAY",
  "NON_NUMERIC_VALUE",
  "MULTI_POSITION",
  "UNKNOWN_POSITION",
  "MANUAL_ADJUSTMENT",
  "SOURCE_FORMULA_ERROR",
] as const;

export type WarningCode = (typeof WARNING_CODES)[number];

export const WARNING_LABELS: Record<WarningCode, string> = {
  MISSING_WEIGHT: "Thiếu một trong hai số cân",
  ACCEPTED_MISMATCH: "Khối lượng công nhận không bằng số cân nhỏ hơn",
  MISSING_VEHICLE: "Phiếu không có biển số xe",
  DUPLICATE_VEHICLE_DAY: "Trùng chuyến xe đã ghi trong ngày",
  WEIGHT_CONFLICT: "Hai nơi ghi khối lượng khác nhau cho cùng chuyến xe",
  VEHICLE_CONFLICT: "Hai nơi ghi biển số khác nhau cho cùng chuyến xe",
  CHAIN_BREAK: "Tồn đầu ngày không khớp tồn cuối ngày trước",
  OPENING_MISMATCH: "Tồn đầu tháng không khớp tồn cuối tháng trước",
  NEGATIVE_CLOSING: "Tồn cuối âm",
  NEGATIVE_CONSUMED: "Lượng sử dụng âm",
  OVER_CAPACITY: "Tồn vượt sức chứa bồn",
  LOW_STOCK: "Tồn dưới ngưỡng cảnh báo",
  USAGE_OUTLIER: "Lượng dùng lệch bất thường so với trung vị tháng",
  TRUCK_WEIGHT_OUTLIER: "Khối lượng xe ngoài dải thường gặp",
  RECEIPT_WITHOUT_PERIOD: "Có phiếu nhập nhưng chưa có kỳ tồn kho",
  MONTH_END_INCOMPLETE: "Chưa có bản đọc ngày cuối tháng",
  PERIOD_GAP: "Thiếu tháng trong chuỗi",
  UNIT_MISMATCH: "Đơn vị không khớp đơn vị lưu trữ",
  INVALID_PERIOD: "Tháng không hợp lệ",
  INVALID_RECEIPT_DAY: "Không đọc được ngày, tạm đặt ngày 01 của tháng",
  NON_NUMERIC_VALUE: "Giá trị không phải số",
  MULTI_POSITION: "Phiếu ghi nhiều cương vị, cần tách thủ công",
  UNKNOWN_POSITION: "Không nhận ra cương vị",
  MANUAL_ADJUSTMENT: "Công thức nguồn có số điều chỉnh thủ công",
  SOURCE_FORMULA_ERROR: "Công thức nguồn bị lỗi",
};
