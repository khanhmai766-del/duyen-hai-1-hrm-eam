import { normalizeText } from "@/lib/nav";
import { positionCodeOf, type PositionCode } from "@/lib/position-catalog";
import { SEED_ITEMS, UNASSIGNED_POSITION, type WarningCode } from "./constants";

/**
 * Chuẩn hóa dữ liệu thô đọc từ workbook.
 *
 * Sheet gốc được nhiều người ghi tay qua nhiều năm nên cùng một thứ có rất nhiều
 * cách viết. Toàn bộ khác biệt đó phải được nuốt ở đây, để phần còn lại của module
 * chỉ làm việc với giá trị đã sạch. Các biến thể liệt kê bên dưới là ĐÃ ĐẾM TRÊN
 * DỮ LIỆU THẬT, không phải phòng xa — xem docs/ton-kho-hoa-chat-spec.md mục 3.4.
 */

// ---------------------------------------------------------------------------
// Tên mặt hàng
// ---------------------------------------------------------------------------

const ITEM_CODE_BY_NAME_KEY = new Map<string, string>();
for (const item of SEED_ITEMS) {
  ITEM_CODE_BY_NAME_KEY.set(normalizeText(item.name).replace(/\s+/g, " ").trim(), item.code);
}

/**
 * Khớp nhãn cột B của tab báo cáo tháng với mã mặt hàng.
 * Chịu được khác biệt hoa/thường, dấu tiếng Việt và khoảng trắng thừa — nhãn PAC
 * trong sheet có một dấu cách dư ở cuối.
 */
export function normalizeChemicalName(raw: unknown): string | null {
  const key = normalizeText(String(raw ?? "")).replace(/\s+/g, " ").trim();
  if (!key) return null;
  return ITEM_CODE_BY_NAME_KEY.get(key) ?? null;
}

// ---------------------------------------------------------------------------
// Kỳ (tháng)
// ---------------------------------------------------------------------------

export type PeriodParseResult =
  | { ok: true; periodKey: string; year: number; month: number }
  | { ok: false; reason: string; code: WarningCode };

const MIN_YEAR = 2020;
const MAX_YEAR = 2100;

/**
 * Đọc kỳ từ hai dạng có trong workbook:
 *   - cột "Tháng" của tab phiếu nhập: số nguyên MMYYYY (32024 = 03/2024, 102024 = 10/2024)
 *   - tên tab báo cáo: chuỗi MMYYYY ("012026", "122025")
 * Ngoài ra chấp nhận luôn dạng chuẩn "YYYY-MM" để dùng lại được ở tầng API.
 *
 * Chặn năm vô lý — đây là thứ bắt được dòng gõ nhầm `72525` trong tab NH3
 * (đúng 21.670 kg, chính là toàn bộ chênh lệch tổng NH3 năm 2025 của sổ gốc).
 */
export function normalizeInventoryPeriod(raw: unknown): PeriodParseResult {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, reason: "Thiếu tháng", code: "INVALID_PERIOD" };

  const iso = /^(\d{4})-(\d{1,2})$/.exec(text);
  if (iso) return buildPeriod(Number(iso[1]), Number(iso[2]));

  const digits = text.replace(/\D/g, "");
  if (!digits) {
    return { ok: false, reason: `Không đọc được tháng từ "${text}"`, code: "INVALID_PERIOD" };
  }

  const value = Number(digits);
  if (!Number.isSafeInteger(value)) {
    return { ok: false, reason: `Tháng không hợp lệ: "${text}"`, code: "INVALID_PERIOD" };
  }

  // MMYYYY: bốn chữ số cuối là năm, phần đầu là tháng.
  return buildPeriod(value % 10_000, Math.floor(value / 10_000));
}

function buildPeriod(year: number, month: number): PeriodParseResult {
  if (year < MIN_YEAR || year > MAX_YEAR) {
    return { ok: false, reason: `Năm ${year} nằm ngoài khoảng hợp lệ`, code: "INVALID_PERIOD" };
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, reason: `Tháng ${month} không hợp lệ`, code: "INVALID_PERIOD" };
  }
  return { ok: true, periodKey: `${year}-${String(month).padStart(2, "0")}`, year, month };
}

/** "YYYY-MM" của một ngày, theo giờ Việt Nam. Server luôn tự suy, không nhận từ client. */
export function periodKeyOf(date: Date): string {
  const vn = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Kỳ liền trước, ví dụ "2026-01" → "2025-12". */
export function previousPeriodKey(periodKey: string): string {
  const [year, month] = periodKey.split("-").map(Number);
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, "0")}`;
}

/** Ngày cuối cùng theo lịch của kỳ — mốc lấy tồn cuối tháng của mặt hàng theo dõi hằng ngày. */
export function lastDateOfPeriod(periodKey: string): Date {
  const [year, month] = periodKey.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0));
}

/**
 * Ghép "ngày trong tháng" của cột A với kỳ lấy từ cột "Tháng".
 * Cột A chỉ ghi số ngày (1..31) và lẫn lộn kiểu chuỗi lẫn số.
 */
export function buildReceiptDate(dayRaw: unknown, periodKey: string): Date | null {
  const day = Number(String(dayRaw ?? "").trim());
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const [year, month] = periodKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Chặn ngày tràn tháng (31/02 sẽ nhảy sang tháng sau).
  if (date.getUTCMonth() !== month - 1) return null;
  return date;
}

// ---------------------------------------------------------------------------
// Cương vị
// ---------------------------------------------------------------------------

/**
 * Cách viết cương vị RIÊNG của workbook hóa chất.
 *
 * Cố ý để ở đây thay vì thêm vào `lib/position-catalog.ts`: đây là thói quen ghi
 * chép của một file Excel cụ thể, không phải danh mục cương vị của nhà máy. Thêm
 * vào catalog dùng chung là mở rộng phạm vi ảnh hưởng sang PCCC và phiếu vật tư
 * mà không được lợi gì.
 */
const SHEET_POSITION_ALIASES: ReadonlyArray<[string, PositionCode]> = [
  ["xlnhh", "MIXED_WATER_TREATMENT"],
  ["xlhh", "MIXED_WATER_TREATMENT"],
  ["xln hon hop", "MIXED_WATER_TREATMENT"],
  ["xlnt", "WASTEWATER_TREATMENT"],
  ["xln thai", "WASTEWATER_TREATMENT"],
  ["xln thai nd 5000", "WASTEWATER_TREATMENT"],
  ["nha dau 300 mnk", "AIR_COMPRESSOR_OIL_HOUSE"],
  ["nh3 lhp", "AUX_BOILER_NH3"],
  ["tram nuoc tho", "RAW_WATER_PUMP"],
];

const SHEET_ALIAS_MAP = new Map<string, PositionCode>(
  SHEET_POSITION_ALIASES.map(([key, code]) => [key, code])
);

function sheetPositionKey(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export type PositionParseResult = {
  /** Mã cương vị đã chuẩn hóa, hoặc null nếu không xác định được. */
  code: PositionCode | typeof UNASSIGNED_POSITION | null;
  /** Nguyên văn, giữ lại khi không chuẩn hóa được để người dùng tự xử. */
  raw: string | null;
  /** Ô ghi nhiều cương vị cùng lúc. */
  multi: boolean;
  warnings: WarningCode[];
};

// Dò trên chuỗi CHỈ được bỏ dấu tiếng Việt, KHÔNG được bỏ ký tự đặc biệt —
// sheetPositionKey() xoá sạch dấu cộng và dấu phẩy nên dò trên nó thì không bao
// giờ khớp.
const MULTI_POSITION_SEPARATOR = /[+,&/]|\bva\b/;

/**
 * Chuẩn hóa ô "Cương vị" của tab phiếu nhập.
 *
 * KHÔNG tự chia khối lượng cho các ô ghi nhiều cương vị. Dữ liệu thật có cả dòng
 * "Máy phó (5970kg)+ XLNHH (1800kg)" — nhét số lượng vào text — nên mọi cách tách
 * tự động đều là đoán. Giữ nguyên văn, gắn cảnh báo, để người dùng tách trên giao diện.
 */
export function normalizeInventoryPosition(raw: unknown): PositionParseResult {
  const text = String(raw ?? "").trim();
  if (!text) return { code: null, raw: null, multi: false, warnings: [] };

  if (MULTI_POSITION_SEPARATOR.test(normalizeText(text))) {
    return { code: null, raw: text, multi: true, warnings: ["MULTI_POSITION"] };
  }

  const key = sheetPositionKey(text);
  const fromSheet = SHEET_ALIAS_MAP.get(key);
  if (fromSheet) return { code: fromSheet, raw: null, multi: false, warnings: [] };

  const fromCatalog = positionCodeOf(text);
  if (fromCatalog) return { code: fromCatalog, raw: null, multi: false, warnings: [] };

  return { code: null, raw: text, multi: false, warnings: ["UNKNOWN_POSITION"] };
}

// ---------------------------------------------------------------------------
// Giá trị số trong ô sheet
// ---------------------------------------------------------------------------

export type CellNumberResult = {
  value: number | null;
  /** Nguyên văn khi ô là chữ — ví dụ mức bồn ghi bằng mm thay vì thể tích. */
  rawText: string | null;
  warnings: WarningCode[];
};

/**
 * Đọc một ô lẽ ra phải là số.
 *
 * Lưu ý khi đọc workbook: KHÔNG bật `cellFormula`, phải lấy giá trị đã tính sẵn
 * (`cell.v`). Nhiều ô khối lượng trong sheet là công thức (`=13270-6866`), tự đi
 * diễn giải công thức là chuốc lỗi không cần thiết.
 */
export function parseCellNumber(raw: unknown): CellNumberResult {
  if (raw === null || raw === undefined || raw === "") {
    return { value: null, rawText: null, warnings: [] };
  }
  if (typeof raw === "number") {
    return Number.isFinite(raw)
      ? { value: raw, rawText: null, warnings: [] }
      : { value: null, rawText: String(raw), warnings: ["NON_NUMERIC_VALUE"] };
  }

  const text = String(raw).trim();
  // Số kiểu Việt Nam ("1.234,5") lẫn kiểu Anh ("1,234.5") đều có trong sheet.
  const cleaned = text.replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const value = Number(cleaned);

  if (cleaned !== "" && Number.isFinite(value)) {
    return { value, rawText: null, warnings: [] };
  }
  return { value: null, rawText: text, warnings: ["NON_NUMERIC_VALUE"] };
}
