import { createHash } from "crypto";
import * as XLSX from "xlsx";
import { normalizeText } from "@/lib/nav";
import {
  SEED_ITEMS,
  SHEET_POSITION_COLUMNS,
  RECONCILE_EPSILON,
  type WarningCode,
} from "./constants";
import {
  buildReceiptDate,
  lastDateOfPeriod,
  normalizeChemicalName,
  normalizeInventoryPeriod,
  normalizeInventoryPosition,
  parseCellNumber,
  previousPeriodKey,
} from "./normalize";
import { normalizeVehicleNumber } from "./validation";
import {
  calculateAcceptedWeight,
  calculateClosingTotal,
  calculateConsumedTotal,
  nearlyEqual,
  roundToStorage,
} from "./calculations";

/**
 * Đọc workbook "Theo dõi hóa chất nhập" và dựng kế hoạch import.
 *
 * Hai bước tách bạch:
 *   buildImportPlan()   — đọc, chuẩn hóa, đối soát. KHÔNG chạm DB.
 *   commitImportPlan()  — ghi trong một transaction, idempotent.
 *
 * Nguyên tắc xuyên suốt: sheet là NGUỒN DỮ LIỆU THÔ, không phải nguồn kết quả.
 * Các cột tổng (L, M, N, O) chỉ đọc để ĐỐI SOÁT rồi báo lệch, không bao giờ được
 * ghi xuống DB — chúng chứa công thức trỏ dải dòng cứng, số cộng tay, và ở tab
 * hợp đồng thì trỏ nhầm sang khối lượng sử dụng.
 *
 * Chi tiết từng cái bẫy: docs/ton-kho-hoa-chat-spec.md mục 3.
 */

// ---------------------------------------------------------------------------
// Phạm vi (quyết định của người dùng: chỉ đưa dữ liệu 2026 lên web)
// ---------------------------------------------------------------------------

/** Kỳ mồi: không hiển thị, chỉ để làm tồn đầu cho tháng 01/2026. */
export const SEED_PERIOD_KEY = "2025-12";
export const IMPORT_YEAR = 2026;

const CONTRACT_SHEET = "Hợp đồng hóa chất 2025";
const SUMMARY_SHEETS = ["Tổng 2025", "Tổng 2026"];
const JUNK_SHEETS: ReadonlyArray<[string, string]> = [
  ["Theo dõi nhập hóa chất", "bản nháp cũ (12 dòng tháng 03–04/2024), đã được các tab riêng thay thế"],
  ["Khối lượng XLNHH", "bản nháp template, chỉ 2 hóa chất, không có định danh tháng, chứa #REF!"],
];

/** Dòng đầu và dòng cuối của vùng mặt hàng trong tab báo cáo tháng. */
const ITEM_ROW_FIRST = 6;
const ITEM_ROW_LAST = 21;

/** Cột tổng của tab báo cáo tháng — CHỈ đọc để đối soát. */
const COL_CLOSING_TOTAL = "L";
const COL_OPENING_TOTAL = "M";
const COL_RECEIVED_TOTAL = "N";
const COL_CONSUMED_TOTAL = "O";

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

export type IssueSeverity = "error" | "warning" | "info";

export type ImportIssue = {
  severity: IssueSeverity;
  sheet: string;
  row?: number;
  column?: string;
  code: WarningCode | "SHEET_SKIPPED" | "OUT_OF_SCOPE" | "LABEL_MISMATCH" | "SHEET_MISSING";
  message: string;
};

export type SheetStat = {
  sheet: string;
  role: "MONTHLY" | "RECEIPT" | "CONTRACT" | "SUMMARY" | "JUNK" | "UNKNOWN";
  rowsRead: number;
  rowsValid: number;
  rowsSkipped: number;
  rowsError: number;
};

export type PlannedPeriod = { periodKey: string; isSeed: boolean; note: string | null };

export type PlannedReading = {
  periodKey: string;
  itemCode: string;
  positionCode: string;
  readDateIso: string;
  quantity: number | null;
  rawText: string | null;
  sheet: string;
  row: number;
  column: string;
};

export type PlannedReceipt = {
  itemCode: string;
  receivedAtIso: string;
  periodKey: string;
  vehicleNumber: string | null;
  vehicleRef: string | null;
  plantWeight: number | null;
  contractorWeight: number | null;
  acceptedWeight: number;
  receivingPosition: string | null;
  receivingPositionRaw: string | null;
  sheet: string;
  row: number;
  sourceKey: string;
  warnings: WarningCode[];
};

export type PlannedContract = {
  year: number;
  itemCode: string;
  materialCode: string | null;
  supplier: string | null;
  origin: string | null;
  contractQuantity: number;
  forecastDemand: number;
};

export type ReconcileRow = {
  itemCode: string;
  periodKey: string;
  field: "closing" | "opening" | "received" | "consumed";
  computed: number | null;
  sheetValue: number | null;
  delta: number | null;
  ok: boolean;
  /**
   * MATCH             — khớp trong sai số đối soát
   * MANUAL_ADJUSTMENT — lệch dưới 10 g: là số cộng tay trong công thức của sheet
   *                     (`=sum(E9:K9)+0.004`), không phải sai sót của phép tính
   * MISMATCH          — lệch thật, cần người xem
   * NO_REFERENCE      — sheet không có số để đối chiếu
   */
  kind: "MATCH" | "MANUAL_ADJUSTMENT" | "MISMATCH" | "NO_REFERENCE";
};

/** Dưới ngưỡng này thì chênh lệch là số cộng tay của sheet, không phải sai sót tính toán. */
const MANUAL_ADJUSTMENT_LIMIT = 0.01;

export type ImportPlan = {
  fileName: string;
  fileHash: string;
  bySheet: SheetStat[];
  issues: ImportIssue[];
  periods: PlannedPeriod[];
  readings: PlannedReading[];
  receipts: PlannedReceipt[];
  contracts: PlannedContract[];
  /** materialCode lấy từ tab hợp đồng, gắn ngược lại danh mục — dùng cho mọi năm. */
  itemMaterialCodes: Record<string, string>;
  reconcile: ReconcileRow[];
};

// ---------------------------------------------------------------------------
// Tiện ích đọc ô
// ---------------------------------------------------------------------------

function cellValue(sheet: XLSX.WorkSheet, address: string): unknown {
  const cell = sheet[address] as XLSX.CellObject | undefined;
  if (!cell) return undefined;
  // Ô lỗi (#REF!, #VALUE!) — trả về marker để bên gọi sinh cảnh báo.
  if (cell.t === "e") return { __error: String(cell.w ?? cell.v ?? "#ERR") };
  return cell.v;
}

function isErrorCell(value: unknown): value is { __error: string } {
  return typeof value === "object" && value !== null && "__error" in value;
}

const headerKey = (value: unknown) =>
  normalizeText(String(value ?? "")).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// Đọc kế hoạch
// ---------------------------------------------------------------------------

export function buildImportPlan(buffer: Buffer, fileName: string): ImportPlan {
  const fileHash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  // KHÔNG bật cellFormula: nhiều ô khối lượng là công thức (=13270-6866) và ta cần
  // giá trị đã tính sẵn, không phải chuỗi công thức.
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const issues: ImportIssue[] = [];
  const bySheet: SheetStat[] = [];
  const periods: PlannedPeriod[] = [];
  const readings: PlannedReading[] = [];
  const receipts: PlannedReceipt[] = [];
  const contracts: PlannedContract[] = [];
  const itemMaterialCodes: Record<string, string> = {};

  /** Giá trị các cột tổng của sheet, chỉ để đối soát. */
  const sheetTotals = new Map<string, { closing: number | null; opening: number | null; received: number | null; consumed: number | null }>();

  const itemBySheetRow = new Map<number, (typeof SEED_ITEMS)[number]>();
  for (const item of SEED_ITEMS) itemBySheetRow.set(item.sheetRow, item);

  const receiptSheetToItem = new Map<string, (typeof SEED_ITEMS)[number]>();
  for (const item of SEED_ITEMS) if (item.receiptSheet) receiptSheetToItem.set(item.receiptSheet, item);

  let outOfScopeMonthly = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];

    const junk = JUNK_SHEETS.find(([name]) => name === sheetName);
    if (junk) {
      issues.push({ severity: "info", sheet: sheetName, code: "SHEET_SKIPPED", message: `Bỏ qua: ${junk[1]}` });
      bySheet.push({ sheet: sheetName, role: "JUNK", rowsRead: 0, rowsValid: 0, rowsSkipped: 0, rowsError: 0 });
      continue;
    }

    if (SUMMARY_SHEETS.includes(sheetName)) {
      issues.push({
        severity: "info",
        sheet: sheetName,
        code: "SHEET_SKIPPED",
        message: "Bỏ qua: tab tổng chỉ chứa công thức trỏ sang tab tháng, không phải nguồn dữ liệu",
      });
      bySheet.push({ sheet: sheetName, role: "SUMMARY", rowsRead: 0, rowsValid: 0, rowsSkipped: 0, rowsError: 0 });
      continue;
    }

    if (sheetName === CONTRACT_SHEET) {
      bySheet.push(readContractSheet(sheet, sheetName, contracts, itemMaterialCodes, issues));
      continue;
    }

    if (/^\d{6}$/.test(sheetName)) {
      const parsed = normalizeInventoryPeriod(sheetName);
      if (!parsed.ok) {
        issues.push({ severity: "error", sheet: sheetName, code: "INVALID_PERIOD", message: parsed.reason });
        continue;
      }
      const inScope = parsed.periodKey === SEED_PERIOD_KEY || parsed.year === IMPORT_YEAR;
      if (!inScope) {
        outOfScopeMonthly += 1;
        continue;
      }
      bySheet.push(
        readMonthlySheet(
          sheet,
          sheetName,
          parsed.periodKey,
          fileHash,
          itemBySheetRow,
          periods,
          readings,
          receipts,
          sheetTotals,
          issues
        )
      );
      continue;
    }

    const receiptItem = receiptSheetToItem.get(sheetName);
    if (receiptItem) {
      bySheet.push(readReceiptSheet(sheet, sheetName, receiptItem, fileHash, receipts, issues));
      continue;
    }

    issues.push({ severity: "warning", sheet: sheetName, code: "SHEET_SKIPPED", message: "Tab không nằm trong sơ đồ import, đã bỏ qua" });
    bySheet.push({ sheet: sheetName, role: "UNKNOWN", rowsRead: 0, rowsValid: 0, rowsSkipped: 0, rowsError: 0 });
  }

  if (outOfScopeMonthly > 0) {
    issues.push({
      severity: "info",
      sheet: "(nhiều tab)",
      code: "OUT_OF_SCOPE",
      message: `Bỏ qua ${outOfScopeMonthly} tab tháng ngoài phạm vi (chỉ import ${SEED_PERIOD_KEY} làm kỳ mồi và năm ${IMPORT_YEAR})`,
    });
  }

  // Kỳ chỉ có phiếu nhập mà chưa có tab báo cáo — tháng 08/2026 rơi vào đây.
  const periodKeys = new Set(periods.map((p) => p.periodKey));
  for (const receipt of receipts) {
    if (periodKeys.has(receipt.periodKey)) continue;
    periodKeys.add(receipt.periodKey);
    periods.push({ periodKey: receipt.periodKey, isSeed: false, note: "Sinh tự động: có phiếu nhập nhưng chưa có bảng tồn kho" });
    issues.push({
      severity: "warning",
      sheet: receipt.sheet,
      code: "RECEIPT_WITHOUT_PERIOD",
      message: `Kỳ ${receipt.periodKey} có phiếu nhập nhưng workbook chưa có tab báo cáo tương ứng — đã tạo kỳ rỗng`,
    });
  }

  const reconcile = buildReconciliation(readings, receipts, sheetTotals, periods);

  return { fileName, fileHash, bySheet, issues, periods, readings, receipts, contracts, itemMaterialCodes, reconcile };
}

// ---------------------------------------------------------------------------
// Tab báo cáo tháng
// ---------------------------------------------------------------------------

function readMonthlySheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  periodKey: string,
  fileHash: string,
  itemBySheetRow: Map<number, (typeof SEED_ITEMS)[number]>,
  periods: PlannedPeriod[],
  readings: PlannedReading[],
  manualReceipts: PlannedReceipt[],
  sheetTotals: Map<string, { closing: number | null; opening: number | null; received: number | null; consumed: number | null }>,
  issues: ImportIssue[]
): SheetStat {
  const isSeed = periodKey === SEED_PERIOD_KEY;
  periods.push({
    periodKey,
    isSeed,
    note: isSeed ? "Kỳ mồi: chỉ mang tồn cuối để làm tồn đầu cho tháng 01/2026" : null,
  });

  const stat: SheetStat = { sheet: sheetName, role: "MONTHLY", rowsRead: 0, rowsValid: 0, rowsSkipped: 0, rowsError: 0 };
  const readDateIso = lastDateOfPeriod(periodKey).toISOString();

  for (let row = ITEM_ROW_FIRST; row <= ITEM_ROW_LAST; row += 1) {
    stat.rowsRead += 1;
    const expected = itemBySheetRow.get(row);
    if (!expected) continue;

    // Nhãn cột B phải khớp — nếu ai đó chèn/xóa dòng thì toàn bộ ánh xạ lệch và
    // số liệu sẽ vào nhầm mặt hàng. Thà dừng còn hơn nhập sai.
    const label = cellValue(sheet, `B${row}`);
    const matched = normalizeChemicalName(label);
    if (matched !== expected.code) {
      stat.rowsError += 1;
      issues.push({
        severity: "error",
        sheet: sheetName,
        row,
        column: "B",
        code: "LABEL_MISMATCH",
        message: `Dòng ${row} phải là "${expected.name}" nhưng sheet ghi "${String(label ?? "")}"`,
      });
      continue;
    }

    let wroteAny = false;
    for (const { column, code } of SHEET_POSITION_COLUMNS) {
      const raw = cellValue(sheet, `${column}${row}`);
      if (raw === undefined || raw === "") continue;

      if (isErrorCell(raw)) {
        issues.push({
          severity: "warning",
          sheet: sheetName,
          row,
          column,
          code: "SOURCE_FORMULA_ERROR",
          message: `Ô ${column}${row} bị lỗi công thức (${raw.__error}) — bỏ qua`,
        });
        continue;
      }

      const parsed = parseCellNumber(raw);
      if (parsed.value === null && parsed.rawText === null) continue;

      if (parsed.rawText !== null) {
        issues.push({
          severity: "warning",
          sheet: sheetName,
          row,
          column,
          code: "NON_NUMERIC_VALUE",
          message: `${expected.name}: ô ${column}${row} ghi bằng chữ ("${parsed.rawText.replace(/\s+/g, " ").trim()}") — giữ nguyên văn, không tính vào tổng`,
        });
      }

      readings.push({
        periodKey,
        itemCode: expected.code,
        positionCode: code,
        readDateIso,
        quantity: parsed.value,
        rawText: parsed.rawText,
        sheet: sheetName,
        row,
        column,
      });
      wroteAny = true;
    }

    if (wroteAny) stat.rowsValid += 1;
    else stat.rowsSkipped += 1;

    // Nhiên liệu không có tab phiếu nhập, nhưng người lập sổ thỉnh thoảng gõ thẳng
    // lượng bơm vào bồn ở cột N (thực tế: DO lò hơi phụ, tháng 01 và 02/2026, mỗi
    // lần 2.000 lít). Người dùng đã chốt "bồn nhiên liệu làm theo logic hiện tại của
    // sheet", nên phải nhận con số này — nếu bỏ, lượng sử dụng sẽ âm khống đúng bằng
    // lượng đã bơm. Dựng thành một phiếu nhập không biển số, đề ngày cuối tháng.
    if (expected.receiptSheet === null) {
      const manualReceived = parseCellNumber(cellValue(sheet, `${COL_RECEIVED_TOTAL}${row}`)).value;
      if (manualReceived !== null && manualReceived > 0) {
        manualReceipts.push({
          itemCode: expected.code,
          receivedAtIso: readDateIso,
          periodKey,
          vehicleNumber: null,
          vehicleRef: null,
          plantWeight: null,
          contractorWeight: null,
          acceptedWeight: roundToStorage(manualReceived),
          receivingPosition: null,
          receivingPositionRaw: null,
          sheet: sheetName,
          row,
          sourceKey: `${fileHash}|${sheetName}|N${row}`,
          warnings: ["MISSING_VEHICLE"],
        });
        issues.push({
          severity: "info",
          sheet: sheetName,
          row,
          column: COL_RECEIVED_TOTAL,
          code: "OUT_OF_SCOPE",
          message: `${expected.name}: cột N ghi thẳng ${manualReceived} — dựng thành một phiếu nhập đề ngày cuối tháng vì mặt hàng này không có tab phiếu`,
        });
      }
    }

    // Cột tổng: CHỈ ghi nhớ để đối soát.
    const totalsKey = `${expected.code}|${periodKey}`;
    sheetTotals.set(totalsKey, {
      closing: parseCellNumber(cellValue(sheet, `${COL_CLOSING_TOTAL}${row}`)).value,
      opening: parseCellNumber(cellValue(sheet, `${COL_OPENING_TOTAL}${row}`)).value,
      received: parseCellNumber(cellValue(sheet, `${COL_RECEIVED_TOTAL}${row}`)).value,
      consumed: parseCellNumber(cellValue(sheet, `${COL_CONSUMED_TOTAL}${row}`)).value,
    });
  }

  return stat;
}

// ---------------------------------------------------------------------------
// Tab phiếu nhập
// ---------------------------------------------------------------------------

const HEADER_ROW = 2;
const FIRST_DATA_ROW = 3;

type ReceiptColumns = {
  day?: string;
  vehicle?: string;
  plant?: string;
  contractor?: string;
  accepted?: string;
  position?: string;
  month?: string;
};

/**
 * Dò cột theo CHỮ trong header dòng 2, không theo vị trí cố định.
 * Tab NH3 lệch một ô so với năm tab còn lại và không có cột "Cương vị".
 */
function detectReceiptColumns(sheet: XLSX.WorkSheet): ReceiptColumns {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const columns: ReceiptColumns = {};

  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const letter = XLSX.utils.encode_col(c);
    const key = headerKey(cellValue(sheet, `${letter}${HEADER_ROW}`));
    if (!key) continue;

    if (!columns.day && key.startsWith("ngay")) columns.day = letter;
    else if (!columns.vehicle && key === "xe") columns.vehicle = letter;
    else if (!columns.plant && key.includes("nha may")) columns.plant = letter;
    else if (!columns.contractor && key.includes("nha thau")) columns.contractor = letter;
    else if (!columns.accepted && key.includes("khoi luong nhap")) columns.accepted = letter;
    else if (!columns.position && key.includes("cuong vi")) columns.position = letter;
    else if (!columns.month && key === "thang") columns.month = letter;
  }

  return columns;
}

function readReceiptSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  item: (typeof SEED_ITEMS)[number],
  fileHash: string,
  receipts: PlannedReceipt[],
  issues: ImportIssue[]
): SheetStat {
  const stat: SheetStat = { sheet: sheetName, role: "RECEIPT", rowsRead: 0, rowsValid: 0, rowsSkipped: 0, rowsError: 0 };
  const columns = detectReceiptColumns(sheet);

  for (const required of ["day", "accepted", "month"] as const) {
    if (!columns[required]) {
      issues.push({
        severity: "error",
        sheet: sheetName,
        row: HEADER_ROW,
        code: "SHEET_MISSING",
        message: `Không tìm thấy cột "${required}" trong header dòng ${HEADER_ROW}`,
      });
      return stat;
    }
  }

  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const seenKeys = new Set<string>();

  for (let row = FIRST_DATA_ROW; row <= range.e.r + 1; row += 1) {
    const acceptedRaw = cellValue(sheet, `${columns.accepted}${row}`);
    const monthRaw = cellValue(sheet, `${columns.month}${row}`);
    if ((acceptedRaw === undefined || acceptedRaw === "") && (monthRaw === undefined || monthRaw === "")) continue;

    stat.rowsRead += 1;

    const period = normalizeInventoryPeriod(monthRaw);
    if (!period.ok) {
      // CẢNH BÁO chứ không phải lỗi chặn: không đọc được tháng thì cũng không biết
      // dòng này có thuộc phạm vi import hay không, và một ô gõ nhầm ở vùng dữ liệu
      // cũ không đáng chặn cả lần nhập. Nếu dòng bị mất thuộc phạm vi thật, bảng
      // đối soát cuối cùng sẽ phát hiện ngay vì tổng tháng sẽ lệch.
      stat.rowsSkipped += 1;
      issues.push({
        severity: "warning",
        sheet: sheetName,
        row,
        column: columns.month,
        code: "INVALID_PERIOD",
        message: `${period.reason} (ô ${columns.month}${row} ghi "${String(monthRaw ?? "")}") — bỏ qua dòng này`,
      });
      continue;
    }

    if (period.year !== IMPORT_YEAR) {
      stat.rowsSkipped += 1;
      continue;
    }

    const warnings: WarningCode[] = [];

    // Ngày hỏng nhưng THÁNG vẫn đọc được thì không mất gì về mặt sổ sách: tồn kho
    // tính theo tháng. Đặt tạm ngày 01 rồi gắn cờ để người dùng sửa, còn hơn bỏ cả
    // dòng và làm lệch tổng tháng. (Thật: NH4OH dòng 31 gõ nhầm ngày thành "NHnh",
    // mang 4.940 kg của tháng 03/2026.)
    const dayRaw = cellValue(sheet, `${columns.day}${row}`);
    let receivedAt = buildReceiptDate(dayRaw, period.periodKey);
    if (!receivedAt) {
      receivedAt = buildReceiptDate(1, period.periodKey)!;
      warnings.push("INVALID_RECEIPT_DAY");
      issues.push({
        severity: "warning",
        sheet: sheetName,
        row,
        column: columns.day,
        code: "INVALID_RECEIPT_DAY",
        message: `Ô ${columns.day}${row} ghi "${String(dayRaw ?? "")}" không phải ngày — tạm đặt 01/${period.periodKey.slice(5)}/${period.periodKey.slice(0, 4)}, tổng tháng vẫn đúng, cần sửa lại ngày`,
      });
    }
    const plant = columns.plant ? parseCellNumber(cellValue(sheet, `${columns.plant}${row}`)).value : null;
    const contractor = columns.contractor ? parseCellNumber(cellValue(sheet, `${columns.contractor}${row}`)).value : null;
    const sheetAccepted = parseCellNumber(acceptedRaw).value;

    const computed = calculateAcceptedWeight(plant, contractor);
    warnings.push(...computed.warnings);

    let accepted = computed.value ?? sheetAccepted;
    if (accepted === null) {
      stat.rowsError += 1;
      issues.push({
        severity: "error",
        sheet: sheetName,
        row,
        code: "MISSING_WEIGHT",
        message: `Dòng ${row} không có khối lượng nào đọc được`,
      });
      continue;
    }

    // Bảo hiểm đổi đơn vị: phần đầu tab NH3 (năm 2024) ghi bằng tấn. Dữ liệu 2026
    // đều là kg nên nhánh này không nên chạy — nếu chạy thì có gì đó sai, phải báo.
    if (plant !== null && plant > 0 && accepted < plant / 100) {
      accepted = accepted * 1000;
      warnings.push("UNIT_MISMATCH");
      issues.push({
        severity: "warning",
        sheet: sheetName,
        row,
        code: "UNIT_MISMATCH",
        message: `Dòng ${row}: khối lượng nhập nhỏ hơn số cân 100 lần — hiểu là đang ghi bằng tấn, đã quy về kg`,
      });
    }

    if (sheetAccepted !== null && !nearlyEqual(accepted, sheetAccepted)) {
      warnings.push("ACCEPTED_MISMATCH");
      issues.push({
        severity: "warning",
        sheet: sheetName,
        row,
        column: columns.accepted,
        code: "ACCEPTED_MISMATCH",
        message: `Dòng ${row}: sheet ghi ${sheetAccepted}, tính lại từ hai số cân ra ${accepted} — dùng số tính lại`,
      });
    }

    // NH3 không có cột cương vị; đã đối chiếu cả 20 tab tháng: tồn NH3 luôn nằm ở
    // cột H (NH3 - LHP), không có ngoại lệ.
    let positionCode: string | null = null;
    let positionRaw: string | null = null;
    if (columns.position) {
      const parsed = normalizeInventoryPosition(cellValue(sheet, `${columns.position}${row}`));
      positionCode = parsed.code;
      positionRaw = parsed.raw;
      for (const warning of parsed.warnings) {
        warnings.push(warning);
        issues.push({
          severity: "warning",
          sheet: sheetName,
          row,
          column: columns.position,
          code: warning,
          message:
            warning === "MULTI_POSITION"
              ? `Dòng ${row} ghi nhiều cương vị ("${parsed.raw}") — giữ nguyên văn, cần tách thủ công`
              : `Dòng ${row}: không nhận ra cương vị "${parsed.raw}"`,
        });
      }
    } else {
      positionCode = "AUX_BOILER_NH3";
    }

    // Cột "Xe" là BIỂN SỐ, chỉ được ghi tắt trong sổ (thường 3 chữ số cuối).
    // Giữ nguyên văn ở vehicleRef để đối chiếu, còn vehicleNumber là bản chuẩn hóa.
    const vehicleRawValue = columns.vehicle ? cellValue(sheet, `${columns.vehicle}${row}`) : undefined;
    const vehicleRef = vehicleRawValue === undefined || vehicleRawValue === "" ? null : String(vehicleRawValue).trim();
    const vehicleNumber = normalizeVehicleNumber(vehicleRef);
    if (vehicleNumber === null) warnings.push("MISSING_VEHICLE");

    // Chống trùng TRONG CÙNG FILE.
    const dedupeKey = `${item.code}|${receivedAt.toISOString()}|${vehicleNumber ?? `row${row}`}`;
    if (seenKeys.has(dedupeKey)) {
      stat.rowsSkipped += 1;
      issues.push({
        severity: "warning",
        sheet: sheetName,
        row,
        code: "DUPLICATE_VEHICLE_DAY",
        message: `Dòng ${row} trùng (ngày ${receivedAt.toISOString().slice(0, 10)}, biển số ${vehicleNumber}) với một dòng trước đó — bỏ qua`,
      });
      continue;
    }
    seenKeys.add(dedupeKey);

    receipts.push({
      itemCode: item.code,
      receivedAtIso: receivedAt.toISOString(),
      periodKey: period.periodKey,
      vehicleNumber,
      vehicleRef,
      plantWeight: plant,
      contractorWeight: contractor,
      acceptedWeight: roundToStorage(accepted),
      receivingPosition: positionCode,
      receivingPositionRaw: positionRaw,
      sheet: sheetName,
      row,
      sourceKey: `${fileHash}|${sheetName}|${row}`,
      warnings,
    });
    stat.rowsValid += 1;
  }

  return stat;
}

// ---------------------------------------------------------------------------
// Tab hợp đồng
// ---------------------------------------------------------------------------

/** Tên hàng hóa trong hợp đồng viết theo danh pháp thương mại, không khớp nhãn sổ tháng. */
const CONTRACT_ITEM_KEYWORDS: ReadonlyArray<[RegExp, string]> = [
  [/hydrochloric|hcl/, "HCL_31"],
  [/hypochlor|naclo/, "NACLO_10"],
  [/hidroxit|hydroxit.*na|naoh/, "NAOH_32"],
  [/ammonium|nh4oh/, "NH4OH_20"],
  [/aluminium|pac/, "PAC_12"],
];

function matchContractItem(label: string): string | null {
  const key = normalizeText(label);
  for (const [pattern, code] of CONTRACT_ITEM_KEYWORDS) {
    if (pattern.test(key)) return code;
  }
  return null;
}

function readContractSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  contracts: PlannedContract[],
  itemMaterialCodes: Record<string, string>,
  issues: ImportIssue[]
): SheetStat {
  const stat: SheetStat = { sheet: sheetName, role: "CONTRACT", rowsRead: 0, rowsValid: 0, rowsSkipped: 0, rowsError: 0 };
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");

  issues.push({
    severity: "info",
    sheet: sheetName,
    code: "SHEET_SKIPPED",
    message:
      'Chỉ lấy tên, mã vật tư, xuất xứ, khối lượng hợp đồng và nhu cầu. Bỏ cột G..S ("Đã nhận" theo tháng) vì từ tháng 9 nó trỏ nhầm sang khối lượng SỬ DỤNG — đã nhận luôn được cộng lại từ phiếu nhập.',
  });

  for (let row = 2; row <= range.e.r + 1; row += 1) {
    const label = cellValue(sheet, `A${row}`);
    if (label === undefined || label === "") continue;
    stat.rowsRead += 1;

    const itemCode = matchContractItem(String(label));
    if (!itemCode) {
      stat.rowsSkipped += 1;
      issues.push({
        severity: "warning",
        sheet: sheetName,
        row,
        column: "A",
        code: "UNKNOWN_POSITION",
        message: `Không khớp được "${String(label)}" với mặt hàng nào trong danh mục`,
      });
      continue;
    }

    const quantity = parseCellNumber(cellValue(sheet, `E${row}`)).value;
    if (quantity === null) {
      stat.rowsError += 1;
      issues.push({ severity: "error", sheet: sheetName, row, column: "E", code: "NON_NUMERIC_VALUE", message: `Thiếu khối lượng hợp đồng ở dòng ${row}` });
      continue;
    }

    const materialCode = String(cellValue(sheet, `B${row}`) ?? "").trim() || null;
    if (materialCode) itemMaterialCodes[itemCode] = materialCode;

    contracts.push({
      year: 2025,
      itemCode,
      materialCode,
      supplier: String(cellValue(sheet, `F${row}`) ?? "").trim() || null,
      origin: String(cellValue(sheet, `C${row}`) ?? "").trim() || null,
      contractQuantity: roundToStorage(quantity),
      forecastDemand: roundToStorage(parseCellNumber(cellValue(sheet, `U${row}`)).value ?? 0),
    });
    stat.rowsValid += 1;
  }

  if (contracts.length > 0) {
    issues.push({
      severity: "warning",
      sheet: sheetName,
      code: "OUT_OF_SCOPE",
      message: `Workbook chỉ có hợp đồng năm 2025 và không có dòng NH3 — hợp đồng năm ${IMPORT_YEAR} phải nhập tay trên giao diện`,
    });
  }

  return stat;
}

// ---------------------------------------------------------------------------
// Đối soát
// ---------------------------------------------------------------------------

function buildReconciliation(
  readings: PlannedReading[],
  receipts: PlannedReceipt[],
  sheetTotals: Map<string, { closing: number | null; opening: number | null; received: number | null; consumed: number | null }>,
  periods: PlannedPeriod[]
): ReconcileRow[] {
  const closingByKey = new Map<string, number | null>();
  const grouped = new Map<string, (number | null)[]>();
  for (const reading of readings) {
    const key = `${reading.itemCode}|${reading.periodKey}`;
    const list = grouped.get(key) ?? [];
    list.push(reading.quantity);
    grouped.set(key, list);
  }
  for (const [key, values] of grouped) closingByKey.set(key, calculateClosingTotal(values));

  const receivedByKey = new Map<string, number>();
  for (const receipt of receipts) {
    const key = `${receipt.itemCode}|${receipt.periodKey}`;
    receivedByKey.set(key, roundToStorage((receivedByKey.get(key) ?? 0) + receipt.acceptedWeight));
  }

  const rows: ReconcileRow[] = [];
  const push = (itemCode: string, periodKey: string, field: ReconcileRow["field"], computed: number | null, sheetValue: number | null) => {
    const delta = computed !== null && sheetValue !== null ? roundToStorage(computed - sheetValue) : null;
    const magnitude = delta === null ? 0 : Math.abs(delta);
    const kind: ReconcileRow["kind"] =
      delta === null
        ? "NO_REFERENCE"
        : magnitude < RECONCILE_EPSILON
          ? "MATCH"
          : magnitude < MANUAL_ADJUSTMENT_LIMIT
            ? "MANUAL_ADJUSTMENT"
            : "MISMATCH";
    rows.push({ itemCode, periodKey, field, computed, sheetValue, delta, ok: kind === "MATCH" || kind === "NO_REFERENCE", kind });
  };

  for (const [key, totals] of sheetTotals) {
    const [itemCode, periodKey] = key.split("|");
    if (periodKey === SEED_PERIOD_KEY) continue; // kỳ mồi: chỉ lấy tồn cuối, không đối soát tiêu hao

    const closing = closingByKey.get(key) ?? null;
    const opening = closingByKey.get(`${itemCode}|${previousPeriodKey(periodKey)}`) ?? null;
    const received = receivedByKey.get(key) ?? null;
    const consumed = calculateConsumedTotal(opening, received, closing);

    push(itemCode, periodKey, "closing", closing, totals.closing);
    push(itemCode, periodKey, "opening", opening, totals.opening);
    push(itemCode, periodKey, "received", received, totals.received);
    push(itemCode, periodKey, "consumed", consumed, totals.consumed);
  }

  // Kỳ có phiếu nhưng không có tab: không có gì để đối soát, chỉ ghi nhận.
  const withTotals = new Set([...sheetTotals.keys()].map((k) => k.split("|")[1]));
  for (const period of periods) {
    if (period.isSeed || withTotals.has(period.periodKey)) continue;
    for (const [key, value] of receivedByKey) {
      const [itemCode, periodKey] = key.split("|");
      if (periodKey !== period.periodKey) continue;
      push(itemCode, periodKey, "received", value, null);
    }
  }

  return rows;
}
