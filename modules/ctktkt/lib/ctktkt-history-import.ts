import * as XLSX from "xlsx";
import { ctktktHistorySourceCellMap } from "./ctktkt-history-layout";
import { isCtktktHistoryCellSelected, selectCtktktHistoryDays, validateCtktktHistoryRanges, type CtktktHistoryRange } from "./ctktkt-history-selection";
import { CTKTKT_DAY03_INPUT_CELLS } from "./ctktkt-fields.generated";
import {
  CTKTKT_BLANK_TEMPLATE_INPUT_FIELDS,
  CTKTKT_CARRY_FORWARD_INPUT_CELLS,
  CTKTKT_COAL_ADJUSTMENT_FIELDS,
  CTKTKT_LEGACY_UNUSED_COAL_BLEND_CELLS,
  CTKTKT_NON_WORKBOOK_INPUT_CELLS,
  CTKTKT_OPERATING_HOURS_CELLS,
  CTKTKT_EXTRA_INPUT_FIELDS,
} from "./ctktkt-extra-fields";
import { createCtktktOperationEvent, ctktktOperationOilCells, ctktktOperationPowerColumn, normalizeCtktktOperationEvents, CTKTKT_OPERATION_ELECTRICAL_POINTS, CTKTKT_EVENT_POWER_ROWS, CTKTKT_OPERATION_EVENTS_CELL } from "./ctktkt-operation-events";
import { CTKTKT_BCSX_LINKED_CELLS } from "./ctktkt-bcsx-link";
import { CTKTKT_WATER_LINKED_CELLS } from "./ctktkt-water-link";
import { CTKTKT_INSTALLED_CAPACITY_CELL, CTKTKT_INSTALLED_CAPACITY_MW } from "./ctktkt-defaults";
import {
  calculateCtktktSummary,
  calculateCtktktMeterSummary,
  calculateNh3Summary,
  NH3_DCS_START_METER_CELLS,
  NH3_OPENING_STOCK_CELL,
  calculateOilDifferences,
  calculateSteamDifferences,
  calculateTkdDcsSummary,
  type CtktktDayEntries,
} from "./ctktkt-report";

export type CtktktImportEntry = { cell: string; value: string; sourceCell?: string };
export type CtktktFormulaCheck = {
  name: string;
  sourceCell: string;
  expected: number | null;
  actual: number | null;
  passed: boolean;
};
export type CtktktHistoryImportPackage = {
  fileName: string;
  month: string;
  throughDay: number;
  days: Array<{ date: string; sheetName: string; manualEntries: CtktktImportEntry[] }>;
  supportingDays: Array<{ date: string; sheetName: string; manualEntries: CtktktImportEntry[] }>;
  audits: Array<{ date: string; total: number; passed: number; failed: CtktktFormulaCheck[] }>;
  totals: { dates: number; manualCellsPrepared: number; nonBlankManualValues: number; supportingValues: number; checks: number; passed: number; failed: number };
  warnings: Array<{ date: string; sheetName: string; cell: string; message: string }>;
};

export const CTKTKT_PRIOR_DAY_METER_SUPPORT_CELLS = [
  "AB8", "AB9", "AB10", "AB11",
  "AL8", "AL9", "AL10", "AL11",
] as const;

function rawCellValue(sheet: XLSX.WorkSheet, address: string) {
  const cell = sheet[address];
  if (!cell) return { isFormula: false, value: null as unknown };
  // Excel errors such as #DIV/0! (stopped unit) carry an error code in v, not a result.
  return { isFormula: Boolean(cell.f), value: cell.t === "e" ? null : cell.v as unknown };
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).trim().replaceAll(" ", "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function storageValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value).trim();
}

function expectedNumber(sheet: XLSX.WorkSheet, address: string) {
  return numeric(rawCellValue(sheet, address).value);
}

function closeEnough(actual: number | null, expected: number | null) {
  if (actual === null || expected === null) return actual === expected;
  return Math.abs(actual - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-10);
}

function auditDay(sheet: XLSX.WorkSheet, entries: CtktktDayEntries, previous?: CtktktDayEntries) {
  const checks: CtktktFormulaCheck[] = [];
  const add = (name: string, sourceCell: string, actual: number | null, expectedDivisor = 1) => {
    const rawExpected = expectedNumber(sheet, sourceCell);
    const expected = rawExpected === null ? null : rawExpected / expectedDivisor;
    checks.push({ name, sourceCell, expected, actual, passed: closeEnough(actual, expected) });
  };
  const summary = calculateCtktktMeterSummary(entries, previous);
  const pmisSummary = calculateCtktktSummary(entries, previous);
  const summaryMappings: Array<[string, string, number | null]> = [
    ["S1 sản lượng đầu cực", "E20", summary.s1.grossMwh], ["S2 sản lượng đầu cực", "H20", summary.s2.grossMwh], ["NM sản lượng đầu cực", "I20", summary.plant.grossMwh],
    ["S1 sản lượng phát lưới", "E21", summary.s1.netMwh], ["S2 sản lượng phát lưới", "H21", summary.s2.netMwh], ["NM sản lượng phát lưới", "I21", summary.plant.netMwh],
    ["S1 điện tự dùng", "E25", summary.s1.auxiliaryMwh], ["S2 điện tự dùng", "H25", summary.s2.auxiliaryMwh], ["NM điện tự dùng", "I25", summary.plant.auxiliaryMwh],
    ["S1 tỷ lệ tự dùng", "E27", summary.s1.auxiliaryPercent], ["S2 tỷ lệ tự dùng", "H27", summary.s2.auxiliaryPercent], ["NM tỷ lệ tự dùng", "I27", summary.plant.auxiliaryPercent],
    ["S1 than nguyên trạng", "E19", summary.s1.rawCoalTonnes], ["S2 than nguyên trạng", "H19", summary.s2.rawCoalTonnes], ["NM than nguyên trạng", "I19", summary.plant.rawCoalTonnes],
    ["NM than quy ẩm", "AR86", summary.plant.adjustedCoalTonnes], ["Nhiệt trị chung", "AT87", summary.plant.hhvKjKg ?? null],
    ["S1 suất hao than", "AU87", summary.s1.netCoalRate], ["S2 suất hao than", "AU88", summary.s2.netCoalRate], ["NM suất hao than", "AU86", summary.plant.netCoalRate],
    ["S1 suất hao nhiệt", "AV87", summary.s1.netHeatRate], ["S2 suất hao nhiệt", "AV88", summary.s2.netHeatRate], ["NM suất hao nhiệt", "AV86", summary.plant.netHeatRate],
  ];
  summaryMappings.forEach(([name, cell, actual]) => add(name, cell, actual));
  for (const [name, rows, actual] of [
    ["S1 than quy ẩm", [87, 88, 89], summary.s1.adjustedCoalTonnes],
    ["S2 than quy ẩm", [90, 91, 92], summary.s2.adjustedCoalTonnes],
  ] as Array<[string, number[], number | null]>) {
    const values = rows.map(row => expectedNumber(sheet, `AR${row}`));
    const expected = values.some(value => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    checks.push({ name, sourceCell: `SUM(AR${rows[0]}:AR${rows.at(-1)})`, expected, actual, passed: closeEnough(actual, expected) });
  }

  const tkd = calculateTkdDcsSummary(entries);
  for (const column of ["M", "N", "O", "P", "Q", "R"] as const) {
    for (const [property, row] of [["pSumTdS1", 11], ["pSumTdS2", 14], ["pSumS1S2", 17], ["pSumT1T2", 18], ["qSumS1S2", 19]] as const) {
      add(`TKĐ ${property} ${column}`, `${column}${row}`, tkd[column][property]);
    }
  }
  const oil1 = calculateOilDifferences(entries, "s1", previous);
  const oil2 = calculateOilDifferences(entries, "s2", previous);
  ["W", "X", "Y", "Z", "AA", "AB"].forEach((column, index) => add(`Dầu S1 ${oil1[index].label}`, `${column}15`, oil1[index].diff));
  ["AG", "AH", "AI", "AJ", "AK", "AL"].forEach((column, index) => add(`Dầu S2 ${oil2[index].label}`, `${column}15`, oil2[index].diff, 1000));
  const steam1 = calculateSteamDifferences(entries, "s1");
  const steam2 = calculateSteamDifferences(entries, "s2");
  const steamInputRow = Array.from({ length: 12 }, (_, index) => 50 + index).find(row => String(sheet[`V${row}`]?.v || "").trim() === "Tổng lưu lượng hơi") ?? 54;
  const steamResultRow = steamInputRow + 1;
  ["W", "X", "Y", "Z", "AA", "AB"].forEach((column, index) => add(`Hơi S1 ${steam1[index].label}`, `${column}${steamResultRow}`, steam1[index].consumption));
  ["AG", "AH", "AI", "AJ", "AK", "AL"].forEach((column, index) => add(`Hơi S2 ${steam2[index].label}`, `${column}${steamResultRow}`, steam2[index].consumption));
  const nh3 = calculateNh3Summary(entries, pmisSummary.plant.grossMwh, pmisSummary.plant.netMwh);
  [69, 70, 71].forEach((row, index) => add(`NH3 bồn ${index + 1} khả dụng 95%`, `Q${row}`, nh3.tankAvailable[index]));
  add("NH3 tồn 24h", "P74", nh3.stock24h); add("NH3 tiêu thụ", "P75", nh3.usedTonnes);
  add("Suất hao NH3 đầu cực", "P77", nh3.rateGross); add("Suất hao NH3 phát lưới", "Q77", nh3.rateNet);
  return checks;
}

function monthFromFileName(fileName: string) {
  const matches = [...fileName.matchAll(/(\d{1,2})[.\-_](\d{1,2})[.\-_](20\d{2})/g)];
  const last = matches.at(-1);
  if (!last) throw new Error("Không xác định được tháng từ tên file. Hãy đặt tên file có ngày dạng dd.mm.yyyy, ví dụ CHỈ TIÊU KTKT 19.09.2026.xlsx.");
  const day = Number(last[1]), month = Number(last[2]), year = Number(last[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new Error("Ngày trong tên file không hợp lệ.");
  return { period: `${year}-${String(month).padStart(2, "0")}`, throughDay: day };
}

function previousMonthEnd(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
}

function validatedIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Ngày nhập dữ liệu không hợp lệ.");
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Ngày nhập dữ liệu không tồn tại trên lịch.");
  }
  return { date: value, period: value.slice(0, 7), day, month, year };
}

function previousIsoDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function findSheetForDate(sheetNames: string[], isoDate: string) {
  const { day, month, year } = validatedIsoDate(isoDate);
  const directNames = [String(day).padStart(2, "0"), String(day)];
  for (const directName of directNames) {
    const exact = sheetNames.find(name => name.trim() === directName);
    if (exact) return exact;
  }
  return sheetNames.find(name => {
    const normalized = name.trim().toLocaleLowerCase("vi-VN");
    const match = normalized.match(/^(?:ngày\s*)?0?(\d{1,2})(?:[.\-_/]0?(\d{1,2})(?:[.\-_/](\d{4}))?)?$/i);
    if (!match || Number(match[1]) !== day) return false;
    if (match[2] && Number(match[2]) !== month) return false;
    if (match[3] && Number(match[3]) !== year) return false;
    return true;
  });
}

export async function buildCtktktHistoryImportPackage(
  fileName: string,
  bytes: ArrayBuffer,
  targetDate?: string,
  targetMonth?: string,
  selectedRanges?: CtktktHistoryRange[],
): Promise<CtktktHistoryImportPackage> {
  const workbook = XLSX.read(bytes, { type: "array", cellFormula: true, cellDates: true });
  const requested = targetDate ? validatedIsoDate(targetDate) : null;
  if (targetMonth && !/^20\d{2}-(0[1-9]|1[0-2])$/.test(targetMonth)) throw new Error("Tháng nhập dữ liệu không hợp lệ.");
  const named = requested || targetMonth ? null : monthFromFileName(fileName);
  const period = requested?.period ?? targetMonth ?? named!.period;
  const ranges = selectedRanges ? validateCtktktHistoryRanges(selectedRanges, period) : undefined;
  const numericSheets = workbook.SheetNames.map(name => Number(name.trim())).filter(day => Number.isInteger(day) && day >= 1 && day <= 31);
  const [importYear, importMonth] = period.split("-").map(Number);
  const throughDay = requested?.day ?? (targetMonth ? new Date(Date.UTC(importYear, importMonth, 0)).getUTCDate() : Math.min(named!.throughDay, Math.max(...numericSheets, 0)));
  if (!throughDay) throw new Error("File không có các sheet ngày 01, 02, ... để nhập.");

  // Hourly meters, HFO tanks and TD21 readings exist in the source but not in the old template's input list.
  const workbookExtraCells = [
    ...(targetMonth ? CTKTKT_EXTRA_INPUT_FIELDS.filter(field => field.section !== "startup_shutdown" && /^[A-Z]+\d+$/.test(field.cell) && !["E39", "H39"].includes(field.cell)).map(field => field.cell) : []),
    ...CTKTKT_CARRY_FORWARD_INPUT_CELLS,
    ...CTKTKT_BLANK_TEMPLATE_INPUT_FIELDS.filter(field => field.section === "power_meters").map(field => field.cell),
  ];
  const inputCells = [...new Set([
    ...CTKTKT_DAY03_INPUT_CELLS,
    ...workbookExtraCells,
    ...CTKTKT_BCSX_LINKED_CELLS,
    ...CTKTKT_WATER_LINKED_CELLS,
  ])].filter(cell => !CTKTKT_LEGACY_UNUSED_COAL_BLEND_CELLS.has(cell));
  const manualCells = [...new Set([
    ...inputCells.filter(cell => !CTKTKT_BCSX_LINKED_CELLS.has(cell) && !CTKTKT_WATER_LINKED_CELLS.has(cell) && !CTKTKT_NON_WORKBOOK_INPUT_CELLS.has(cell)),
    ...CTKTKT_COAL_ADJUSTMENT_FIELDS.map(field => field.cell),
  ])].filter(cell => !CTKTKT_LEGACY_UNUSED_COAL_BLEND_CELLS.has(cell)
    && !NH3_DCS_START_METER_CELLS.has(cell)
    && cell !== NH3_OPENING_STOCK_CELL
    // Giờ lũy kế luôn cộng dồn từ QLKT, không lấy theo file.
    && !(CTKTKT_OPERATING_HOURS_CELLS as readonly string[]).includes(cell));
  const warnings: CtktktHistoryImportPackage["warnings"] = [];
  const entriesByDate = new Map<string, CtktktDayEntries>();
  const sheets: Array<{ sheetName: string; date: string; importDay: boolean }> = [];
  if (requested) {
    const targetSheetName = findSheetForDate(workbook.SheetNames, requested.date);
    if (!targetSheetName) {
      throw new Error(`Không tìm thấy sheet ngày ${String(requested.day).padStart(2, "0")} cho ngày ${requested.date.split("-").reverse().join("/")}.`);
    }
    const priorDate = previousIsoDate(requested.date);
    const priorSheetName = requested.day === 1
      ? workbook.SheetNames.find(name => name.trim().toLocaleLowerCase("vi-VN") === "d-1")
      : findSheetForDate(workbook.SheetNames, priorDate);
    if (!priorSheetName) {
      const priorLabel = requested.day === 1 ? "D-1" : String(requested.day - 1).padStart(2, "0");
      throw new Error(`Thiếu sheet ${priorLabel} để tính và đối chiếu các chỉ tiêu chênh lệch của ngày ${requested.date.split("-").reverse().join("/")}.`);
    }
    sheets.push({ sheetName: priorSheetName, date: priorDate, importDay: false });
    sheets.push({ sheetName: targetSheetName, date: requested.date, importDay: true });
  } else {
    const priorSheetName = workbook.SheetNames.find(name => name.trim().toLocaleLowerCase("vi-VN") === "d-1");
    if (priorSheetName) sheets.push({ sheetName: priorSheetName, date: previousMonthEnd(period), importDay: !targetMonth });
    for (let day = 1; day <= throughDay; day++) {
      const date = `${period}-${String(day).padStart(2, "0")}`;
      const sheetName = targetMonth ? findSheetForDate(workbook.SheetNames, date) : String(day).padStart(2, "0");
      if (sheetName) sheets.push({ sheetName, date, importDay: true });
    }
    if (targetMonth && !sheets.some(item => item.importDay)) throw new Error("File không có sheet ngày thuộc tháng đã chọn.");
  }

  const days: CtktktHistoryImportPackage["days"] = [];
  const supportingDays: CtktktHistoryImportPackage["supportingDays"] = [];
  for (const item of sheets) {
    const actualSheetName = workbook.SheetNames.find(name => name === item.sheetName || name === String(Number(item.sheetName)));
    const sheet = actualSheetName ? workbook.Sheets[actualSheetName] : undefined;
    if (!sheet) throw new Error(`Thiếu sheet ngày ${item.sheetName}.`);
    const entries: CtktktDayEntries = {};
    const sourceCells = ctktktHistorySourceCellMap(sheet);
    for (const cell of inputCells) {
      const sourceCell = sourceCells.has(cell) ? sourceCells.get(cell) : cell;
      if (!sourceCell) continue;
      const source = rawCellValue(sheet, sourceCell);
      if (source.isFormula) {
        if (item.importDay) warnings.push({ ...item, cell, message: "Ô thuộc nhóm nhập tay nhưng file chứa công thức; đã bỏ qua." });
        continue;
      }
      const value = storageValue(source.value);
      if (value !== "") entries[cell] = value;
    }
    entries[CTKTKT_INSTALLED_CAPACITY_CELL] = CTKTKT_INSTALLED_CAPACITY_MW;
    // File cũ có thể nhúng hiệu chỉnh cân than vào công thức kết quả. Thu hồi
    // hiệu chỉnh về đúng các ô nhập riêng để web không cộng thiếu hoặc cộng hai lần.
    const priorDate = new Date(`${item.date}T12:00:00Z`); priorDate.setUTCDate(priorDate.getUTCDate() - 1);
    const previous = entriesByDate.get(priorDate.toISOString().slice(0, 10));
    const meterTotal = (source: CtktktDayEntries | undefined, column: string) => {
      const values = Array.from({ length: 12 }, (_, index) => numeric(source?.[`${column}${16 + index}`]));
      return values.some(value => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    };
    const recover = (columns: string[], correctionCells: string[]) => columns.forEach((resultColumn, index) => {
      const currentTotal = meterTotal(entries, resultColumn);
      const base = index === 0 ? meterTotal(previous, columns[2]) : meterTotal(entries, columns[index - 1]);
      const expected = expectedNumber(sheet, `${resultColumn}28`);
      if (expected !== null && currentTotal !== null && base !== null) entries[correctionCells[index]] = String(expected - (currentTotal - base));
    });
    recover(["X", "Z", "AB"], ["W28", "Y28", "AA28"]); recover(["AH", "AJ", "AL"], ["AG28", "AI28", "AK28"]);
    // Một số file tháng cũ chèn thêm dòng trong cụm hơi, làm hàng nhập dịch
    // khỏi hàng 54. Chuẩn hóa về mã ô nội bộ cố định của web trước khi tính.
    const steamInputRow = Array.from({ length: 12 }, (_, index) => 50 + index)
      .find(row => String(sheet[`V${row}`]?.v || "").trim() === "Tổng lưu lượng hơi") ?? 54;
    if (steamInputRow !== 54) {
      for (const column of ["W", "X", "Y", "Z", "AA", "AB", "AG", "AH", "AI", "AJ", "AK", "AL"]) {
        const source = rawCellValue(sheet, `${column}${steamInputRow}`);
        if (!source.isFormula) entries[`${column}54`] = storageValue(source.value);
      }
    }
    entriesByDate.set(item.date, entries);
    if (item.importDay) {
      const manualEntries: CtktktImportEntry[] = manualCells.filter(cell => !targetMonth || (cell !== CTKTKT_INSTALLED_CAPACITY_CELL && (cell !== "W86" || item.date.endsWith("-01")))).map(cell => ({ cell, value: entries[cell] ?? "", ...(sourceCells.get(cell) && sourceCells.get(cell) !== cell ? {sourceCell: sourceCells.get(cell)!} : {}) }));
      // Current source event layout stores six slots in one JSON field on the web.
      if (targetMonth && (!ranges || isCtktktHistoryCellSelected(ranges, item.date, CTKTKT_OPERATION_EVENTS_CELL)) && String(sheet.B85?.v || "").includes("Khởi động tổ máy S1")) {
        const events = [];
        for (const unit of ["S1", "S2"] as const) for (const kind of ["startup", "shutdown", "incident_oil"] as const) {
          const event = createCtktktOperationEvent(unit, kind);
          let hasReading = false;
          for (const mapping of ctktktOperationOilCells(event)) {
            const reading = event.points[mapping.point]!;
            for (const [property, address] of [["oilFeed", mapping.feedCell], ["oilReturn", mapping.returnCell]] as const) {
              const source = rawCellValue(sheet, address!);
              if (!source.isFormula) reading[property] = storageValue(source.value);
              if (reading[property] !== "") hasReading = true;
            }
            const time = mapping.timeCell ? sheet[mapping.timeCell] : undefined;
            if (time && !time.f) {
              if (time.v instanceof Date) reading.time = time.v.toISOString().slice(0, 16);
              else if (typeof time.v === "number") reading.time = new Date((time.v - 25569) * 86400000).toISOString().slice(0, 16);
              else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(time.v))) reading.time = String(time.v).slice(0, 16);
              if (reading.time) hasReading = true;
            }
          }
          for (const point of CTKTKT_OPERATION_ELECTRICAL_POINTS[kind]) {
            const column = ctktktOperationPowerColumn(event, point)!;
            const reading = event.points[point]!;
            const headerTime = String(sheet[`${column}59`]?.v || "").match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})/);
            if (headerTime) { reading.time = `${headerTime[3]}-${headerTime[2]}-${headerTime[1]}T${headerTime[4]}`; hasReading = true; }
            for (const {row} of CTKTKT_EVENT_POWER_ROWS) {
              if (row === 83 && point !== "grid_sync") continue;
              const source = rawCellValue(sheet, `${column}${row}`);
              if (!source.isFormula) reading.power[String(row)] = storageValue(source.value);
              if (reading.power[String(row)]) hasReading = true;
            }
          }
          if (hasReading) events.push(event);
        }
        if (events.length) manualEntries.push({cell:CTKTKT_OPERATION_EVENTS_CELL,value:normalizeCtktktOperationEvents(events)});
      }
      if (!targetMonth || manualEntries.some(entry => entry.value !== "")) days.push({ date: item.date, sheetName: actualSheetName!, manualEntries: targetMonth ? manualEntries.filter(entry => entry.value !== "") : manualEntries });
    } else if (requested || targetMonth) {
      supportingDays.push({
        date: item.date,
        sheetName: actualSheetName!,
        manualEntries: CTKTKT_PRIOR_DAY_METER_SUPPORT_CELLS
          .map(cell => ({ cell, value: entries[cell] ?? "" }))
          .filter(entry => entry.value !== ""),
      });
    }
  }

  const selectedDays = ranges ? selectCtktktHistoryDays(days, ranges) : days;
  if (ranges) supportingDays.length = 0; // D-1 is read for calculations only, never silently written outside selected dates.
  const audits = (ranges ? [] : days).filter(day => day.date.startsWith(period)).map(day => {
    const sheet = workbook.Sheets[day.sheetName]!;
    const priorDate = new Date(`${day.date}T12:00:00Z`); priorDate.setUTCDate(priorDate.getUTCDate() - 1);
    const checks = auditDay(sheet, entriesByDate.get(day.date) || {}, entriesByDate.get(priorDate.toISOString().slice(0, 10)));
    return { date: day.date, total: checks.length, passed: checks.filter(check => check.passed).length, failed: checks.filter(check => !check.passed) };
  });
  const totals = {
    dates: selectedDays.length,
    manualCellsPrepared: selectedDays.reduce((sum, day) => sum + day.manualEntries.length, 0),
    nonBlankManualValues: selectedDays.reduce((sum, day) => sum + day.manualEntries.filter(entry => entry.value !== "").length, 0),
    supportingValues: supportingDays.reduce((sum, day) => sum + day.manualEntries.length, 0),
    checks: audits.reduce((sum, audit) => sum + audit.total, 0),
    passed: audits.reduce((sum, audit) => sum + audit.passed, 0),
    failed: audits.reduce((sum, audit) => sum + audit.failed.length, 0),
  };
  return { fileName, month: period, throughDay, days: selectedDays, supportingDays, audits, totals, warnings: ranges ? warnings.filter(item => isCtktktHistoryCellSelected(ranges, item.date, item.cell)) : warnings };
}
