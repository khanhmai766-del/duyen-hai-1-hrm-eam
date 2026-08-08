import { normalizeText } from "@/lib/nav";

export const POSITION_UNITS = ["S1", "S2", "COMMON"] as const;
export type PositionUnit = (typeof POSITION_UNITS)[number];

export const POSITION_CODES = [
  "SHIFT_SUPERVISOR",
  "BOILER_TURBINE_SHIFT_LEAD",
  "ELECTRICAL_SHIFT_LEAD",
  "TURBINE_LEAD",
  "TURBINE_DEPUTY",
  "TURBINE_ASSISTANT",
  "BOILER_LEAD",
  "BOILER_DEPUTY",
  "COAL_MILL",
  "ESP",
  "FGD",
  "ASH_HANDLING",
  "CIRCULATING_WATER_PUMP",
  "AIR_COMPRESSOR_OIL_HOUSE",
  "MIXED_WATER_TREATMENT",
  "WASTEWATER_TREATMENT",
  "AUX_BOILER_NH3",
  "ELECTRICAL_MAIN_OPERATOR",
  "ELECTRICAL_ASSISTANT_OPERATOR",
  "INSTRUMENT_CONTROL",
  "RAW_WATER_PUMP",
] as const;

export type PositionCode = (typeof POSITION_CODES)[number];

type SheetLabels = Partial<Record<PositionUnit, string>>;

export type PositionCatalogItem = {
  code: PositionCode;
  label: string;
  aliases: readonly string[];
  units: readonly PositionUnit[];
  sheetLabels: SheetLabels;
};

const ALL_UNITS = POSITION_UNITS;
const UNIT_1_2 = ["S1", "S2"] as const;

/**
 * Nguồn chuẩn duy nhất cho cương vị nghiệp vụ.
 *
 * - `code`: khóa ổn định để lưu và so khớp trong hệ thống.
 * - `label`: nhãn hiển thị trên website.
 * - `aliases`: nhãn cũ, viết tắt và nhãn lấy từ Google Sheet.
 * - `sheetLabels`: giá trị phải ghi ngược ra form khiếm khuyết theo tổ máy.
 */
export const POSITION_CATALOG: readonly PositionCatalogItem[] = [
  {
    code: "SHIFT_SUPERVISOR",
    label: "Trưởng ca",
    aliases: ["1. Trưởng ca"],
    units: ALL_UNITS,
    sheetLabels: { S1: "1. Trưởng ca", S2: "1. Trưởng ca", COMMON: "1. Trưởng ca" },
  },
  {
    code: "BOILER_TURBINE_SHIFT_LEAD",
    label: "TK Lò máy",
    aliases: [
      "Trưởng kíp Lò - Máy DH1",
      "Trưởng kíp Lò - Máy",
      "Trưởng kíp Lò máy",
      "2. Trưởng kíp lò máy",
      "TKLM", // viết tắt trong bảng quản lý thiết bị PCCC
    ],
    units: ALL_UNITS,
    sheetLabels: {
      S1: "2. Trưởng kíp lò máy",
      S2: "2. Trưởng kíp lò máy",
      COMMON: "2. Trưởng kíp lò máy",
    },
  },
  {
    code: "ELECTRICAL_SHIFT_LEAD",
    label: "Trưởng kíp điện",
    aliases: ["TK điện", "3. Trưởng kíp điện", "TKĐ"], // TKĐ: viết tắt trong bảng PCCC
    units: ALL_UNITS,
    sheetLabels: {
      S1: "3. Trưởng kíp điện",
      S2: "3. Trưởng kíp điện",
      COMMON: "3. Trưởng kíp điện",
    },
  },
  {
    code: "TURBINE_LEAD",
    label: "Máy trưởng",
    aliases: ["4. Máy trưởng S1", "5. Máy trưởng S2"],
    units: UNIT_1_2,
    sheetLabels: { S1: "4. Máy trưởng S1", S2: "5. Máy trưởng S2" },
  },
  {
    code: "TURBINE_DEPUTY",
    label: "Máy phó",
    aliases: ["6. Máy phó S1", "7. Máy phó S2"],
    units: UNIT_1_2,
    sheetLabels: { S1: "6. Máy phó S1", S2: "7. Máy phó S2" },
  },
  {
    code: "TURBINE_ASSISTANT",
    label: "Trợ thủ",
    aliases: ["8. Trợ thủ S1", "9. Trợ thủ S2"],
    units: UNIT_1_2,
    sheetLabels: { S1: "8. Trợ thủ S1", S2: "9. Trợ thủ S2" },
  },
  {
    code: "BOILER_LEAD",
    label: "Lò trưởng",
    aliases: ["10. Lò trưởng S1", "11. Lò trưởng S2"],
    units: UNIT_1_2,
    sheetLabels: { S1: "10. Lò trưởng S1", S2: "11. Lò trưởng S2" },
  },
  {
    code: "BOILER_DEPUTY",
    label: "Lò phó",
    aliases: ["12. Lò phó S1", "13. Lò phó S2"],
    units: UNIT_1_2,
    sheetLabels: { S1: "12. Lò phó S1", S2: "13. Lò phó S2" },
  },
  {
    code: "COAL_MILL",
    label: "Máy nghiền",
    aliases: ["MN", "14. Máy nghiền S1", "15. Máy nghiền S2"],
    units: UNIT_1_2,
    sheetLabels: { S1: "14. Máy nghiền S1", S2: "15. Máy nghiền S2" },
  },
  {
    code: "ESP",
    label: "ESP",
    aliases: ["16. ESP S1", "17. ESP S2"],
    units: UNIT_1_2,
    sheetLabels: { S1: "16. ESP S1", S2: "17. ESP S2" },
  },
  {
    code: "FGD",
    label: "FGD",
    aliases: ["18. FGD S1", "19. FGD S2"],
    units: ALL_UNITS,
    sheetLabels: { S1: "18. FGD S1", S2: "19. FGD S2", COMMON: "FGD" },
  },
  {
    code: "ASH_HANDLING",
    label: "Thải xỉ",
    aliases: ["20. Thải xỉ S1", "21. Thải xỉ S2"],
    units: UNIT_1_2,
    sheetLabels: { S1: "20. Thải xỉ S1", S2: "21. Thải xỉ S2" },
  },
  {
    code: "CIRCULATING_WATER_PUMP",
    label: "Trạm bơm tuần hoàn",
    aliases: ["TBTH", "Tuần hoàn", "VHV TBTH", "22. VHV TBTH"],
    units: ALL_UNITS,
    sheetLabels: { S1: "22. VHV TBTH", S2: "22. VHV TBTH", COMMON: "22. VHV TBTH" },
  },
  {
    code: "AIR_COMPRESSOR_OIL_HOUSE",
    label: "Khí nén - Nhà dầu",
    aliases: [
      "Khí nén - nhà dầu 300m3",
      "Khí Nén-Nhà Dầu",
      "Nhà dầu - khí nén",
      "Khí nén-Dầu 300",
      "VHV MNK-ND3.",
      "VHV MNK-ND3",
      "MNK - ND300M3", // cách viết trong bảng PCCC
      "MÁY NÉN KHÍ VÀ DẦU 300M3", // bảng PCCC viết đầy đủ, không viết tắt
      "VHV Trạm khí nén - Nhà dầu HFO 300m3",
      "23. VHV MNK-ND3.",
    ],
    units: ["COMMON"],
    sheetLabels: { COMMON: "23. VHV MNK-ND3." },
  },
  {
    code: "MIXED_WATER_TREATMENT",
    label: "XLN hỗn hợp",
    // "XLN HH" và "XỬ LÝ NƯỚC HỖN HỢP": hai cách viết trong bảng PCCC
    aliases: ["XLNHH", "XLN HH", "XỬ LÝ NƯỚC HỖN HỢP", "VHV XLNHH", "VHV XLN hỗn hợp", "24. VHV XLNHH"],
    units: ["COMMON"],
    sheetLabels: { COMMON: "24. VHV XLNHH" },
  },
  {
    code: "WASTEWATER_TREATMENT",
    label: "XLNT",
    aliases: [
      "XLNT - Nhà dầu 5000m3",
      "XLNT-Dầu 5000",
      "VHV XLNT-ND5.",
      "VHV XLNT-ND5",
      "XLNT-ND5000M3", // cách viết trong bảng PCCC
      "XỬ LÝ NƯỚC THẢI VÀ DẦU 5000M3", // bảng FOAM+CO2+DIESEL viết đầy đủ, không viết tắt
      "VHV XLN thải - Nhà dầu 5000m3",
      "25. VHV XLNT-ND5.",
    ],
    units: ["COMMON"],
    sheetLabels: { COMMON: "25. VHV XLNT-ND5." },
  },
  {
    code: "AUX_BOILER_NH3",
    label: "NH3 - Lò hơi phụ",
    aliases: [
      "NH3- Lò hơi phụ",
      "NH3 VÀ LÒ HƠI PHỤ", // bảng FOAM+CO2+DIESEL dùng "và" thay cho gạch nối
      "NH3 - Lò phụ",
      "NH3- Lò phụ",
      "VHV NH3-LHP",
      "VHV Trạm NH3 - Lò hơi phụ",
      "26. VHV NH3-LHP",
    ],
    units: ["COMMON"],
    sheetLabels: { COMMON: "26. VHV NH3-LHP" },
  },
  {
    code: "ELECTRICAL_MAIN_OPERATOR",
    label: "Trực chính điện",
    aliases: ["27. Trực chính điện"],
    units: UNIT_1_2,
    sheetLabels: { S1: "27. Trực chính điện", S2: "27. Trực chính điện" },
  },
  {
    code: "ELECTRICAL_ASSISTANT_OPERATOR",
    label: "Trực phụ điện",
    aliases: ["28. Trực phụ điện"],
    units: UNIT_1_2,
    sheetLabels: { S1: "28. Trực phụ điện", S2: "28. Trực phụ điện" },
  },
  {
    code: "INSTRUMENT_CONTROL",
    label: "Thiết bị đo lường điều khiển",
    aliases: [
      "I&C",
      "I & C",
      "C&I",
      "Kỹ thuật viên I&C",
      "KTV I&C",
      "Thiết bị đo lường và điều khiển",
      "Thiết bị đo lường & điều khiển",
      "TBĐL&ĐK", // viết tắt trong bảng PCCC
      "VHV C&I",
      "VHV Thiết bị đo lường điều khiển",
      "29. VHV C&I",
    ],
    units: ALL_UNITS,
    sheetLabels: { S1: "29. VHV C&I", S2: "29. VHV C&I", COMMON: "29. VHV C&I" },
  },
  {
    code: "RAW_WATER_PUMP",
    label: "Trạm bơm nước thô",
    aliases: ["Trạm nước thô", "VHV Trạm bơm nước thô", "30. VHV Trạm bơm nước thô"],
    units: ["COMMON"],
    sheetLabels: { COMMON: "30. VHV Trạm bơm nước thô" },
  },
] as const;

const POSITION_CODE_SET = new Set<string>(POSITION_CODES);
const CATALOG_BY_CODE = new Map<PositionCode, PositionCatalogItem>(
  POSITION_CATALOG.map((item) => [item.code, item])
);

export function positionAliasKey(value?: string | null) {
  return normalizeText(String(value ?? ""))
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/^\s*\d+\s*[.)-]?\s*/, "")
    // Sheet có nơi thêm tiền tố “VHV”, nơi khác lại bỏ. Đây chỉ là cách ghi
    // chức danh, không tạo ra một cương vị mới (VHV FGD S2 vẫn chính là FGD).
    .replace(/^vhv\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+s[12]$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CODE_BY_ALIAS_KEY = new Map<string, PositionCode>();
for (const item of POSITION_CATALOG) {
  for (const value of [item.code, item.label, ...item.aliases, ...Object.values(item.sheetLabels)]) {
    const key = positionAliasKey(value);
    if (!key) continue;
    const existing = CODE_BY_ALIAS_KEY.get(key);
    if (existing && existing !== item.code) {
      throw new Error(`Bí danh cương vị "${value}" bị trùng giữa ${existing} và ${item.code}`);
    }
    CODE_BY_ALIAS_KEY.set(key, item.code);
  }
}

export function isPositionCode(value?: string | null): value is PositionCode {
  return Boolean(value && POSITION_CODE_SET.has(value));
}

export function positionCodeOf(value?: string | null): PositionCode | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (isPositionCode(raw)) return raw;
  return CODE_BY_ALIAS_KEY.get(positionAliasKey(raw)) ?? null;
}

export function positionCatalogItem(value?: string | null) {
  const code = positionCodeOf(value);
  return code ? CATALOG_BY_CODE.get(code) ?? null : null;
}

export function positionLabelOf(value?: string | null) {
  return positionCatalogItem(value)?.label ?? String(value ?? "").trim().replace(/\s+S[12]$/i, "");
}

export function positionsMatch(left?: string | null, right?: string | null) {
  const leftCode = positionCodeOf(left);
  const rightCode = positionCodeOf(right);
  if (leftCode || rightCode) return Boolean(leftCode && rightCode && leftCode === rightCode);
  const leftKey = positionAliasKey(left);
  const rightKey = positionAliasKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

export function positionAllowedForUnit(unit?: string | null, value?: string | null) {
  if (!unit || !POSITION_UNITS.includes(unit as PositionUnit)) return true;
  const item = positionCatalogItem(value);
  return item ? item.units.includes(unit as PositionUnit) : false;
}

export function positionSheetLabel(value?: string | null, unit?: string | null) {
  if (!unit || !POSITION_UNITS.includes(unit as PositionUnit)) return null;
  const item = positionCatalogItem(value);
  return item?.sheetLabels[unit as PositionUnit] ?? null;
}

export function positionLabelsForUnit(unit?: string | null) {
  if (!unit || !POSITION_UNITS.includes(unit as PositionUnit)) {
    return POSITION_CATALOG.map((item) => item.label);
  }
  return POSITION_CATALOG
    .filter((item) => item.units.includes(unit as PositionUnit))
    .map((item) => item.label);
}
