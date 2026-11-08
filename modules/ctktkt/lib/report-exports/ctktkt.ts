import ExcelJS from "exceljs";
import { guardExportZeroDivisions } from "@/modules/ctktkt/lib/export-zero-division";
import { applyCtktktExportPresentation, hideCtktktExportScratchArea } from "@/modules/ctktkt/lib/ctktkt-export-presentation";
import { getRawDb } from "@/modules/ctktkt/db";
import { calculateDailyProduction } from "@/modules/ctktkt/lib/daily-production-calculations";
import { CTKTKT_BCSX_LINKED_CELLS, deriveCtktktCellsFromBcsx, type CtktktBcsxReading } from "@/modules/ctktkt/lib/ctktkt-bcsx-link";
import { CTKTKT_WATER_LINKED_CELLS, ctktktWaterLogFromRow, deriveCtktktCellsFromWater } from "@/modules/ctktkt/lib/ctktkt-water-link";
import { CTKTKT_DAY03_INPUT_CELLS } from "@/modules/ctktkt/lib/ctktkt-fields.generated";
import { CTKTKT_CARRY_FORWARD_INPUT_CELLS, CTKTKT_EXTRA_INPUT_FIELDS, CTKTKT_NON_WORKBOOK_INPUT_CELLS, CTKTKT_OPERATING_HOURS_CELLS, getCtktktCoalAdjustmentNotes, getCtktktWaterAdjustments } from "@/modules/ctktkt/lib/ctktkt-extra-fields";
import { loadCtktktOperatingHours } from "@/modules/ctktkt/lib/ctktkt-operating-hours-db";
import { addDaysIso, vietnamDateIso } from "@/modules/ctktkt/lib/operating-date";
import { CTKTKT_TEMPLATE_BASE64 } from "@/modules/ctktkt/lib/ctktkt-template.generated";
import { ensureWaterSchema } from "@/modules/ctktkt/lib/water-report/schema";
import { CTKTKT_INSTALLED_CAPACITY_CELL, CTKTKT_INSTALLED_CAPACITY_MW } from "@/modules/ctktkt/lib/ctktkt-defaults";
import { deriveNh3StartLevels, deriveNh3OpeningStock, NH3_OPENING_STOCK_CELL, type CtktktDayEntries } from "@/modules/ctktkt/lib/ctktkt-report";
import { applyCtktktOperationEventLayout, applyCtktktOperationEvents, CTKTKT_OPERATION_EVENTS_CELL, legacyCtktktOperationEvents } from "@/modules/ctktkt/lib/ctktkt-operation-events";
import {
  applyCtktktCoalAdjustments,
  applyCtktktDailyCarryovers,
  CTKTKT_GRINDING_BALL_DEFAULT,
  ctktktDateLabelCells,
  ctktktExportCell,
  prepareCtktktDaySheet,
  prepareCtktktPreviousMonthSheet,
  sanitizeCtktktTemplate,
} from "@/modules/ctktkt/lib/ctktkt-export-layout";

const periodPattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/;
const legacyOperationEventInputCells = new Set([
  "C87", "D87", "E87", "F87", "G87", "H87", "C88", "D88", "E88", "F88", "G88", "H88",
  "C93", "D93", "E93", "F93", "G93", "H93", "C94", "D94", "E94", "F94", "G94", "H94",
]);

function monthBounds(period: string) {
  const [year, month] = period.split("-").map(Number);
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const previousDate = new Date(`${period}-01T12:00:00+07:00`);
  previousDate.setDate(previousDate.getDate() - 1);
  const previous = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(previousDate);
  return { year, month, previous, next };
}

function numeric(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function setNumber(sheet: ExcelJS.Worksheet, cell: string, value: number | null) {
  if (value !== null && Number.isFinite(value)) sheet.getCell(cell).value = value;
}

function ktktCells(row: Record<string, string> | undefined): CtktktDayEntries {
  const entries: CtktktDayEntries = {};
  for (const [code, value] of Object.entries(row || {})) {
    if (code.startsWith("KTKT:")) entries[code.slice(5)] = value;
  }
  return entries;
}

function applyNh3StartLevelCarryover(
  sheet: ExcelJS.Worksheet,
  previousRow: Record<string, string> | undefined,
) {
  sheet.getCell(NH3_OPENING_STOCK_CELL).value = numeric(deriveNh3OpeningStock(ktktCells(previousRow)));
  for (const [cell, value] of Object.entries(deriveNh3StartLevels(ktktCells(previousRow)))) {
    setNumber(sheet, cell, numeric(value));
  }
}

function applyCoalAdjustmentNotes(sheet: ExcelJS.Worksheet, row: Record<string, string>) {
  for (const [cell, note] of Object.entries(getCtktktCoalAdjustmentNotes(row))) sheet.getCell(cell).note = note;
}

function applyWaterAdjustments(sheet: ExcelJS.Worksheet, row: Record<string, string>) {
  const { adjS1, adjS2, noteS1, noteS2 } = getCtktktWaterAdjustments(row);
  if (adjS1 !== 0) {
    sheet.getCell("Y72").value = { formula: `X72-W72+(${adjS1})` };
  }
  if (noteS1) {
    sheet.getCell("Y72").note = `Lý do hiệu chỉnh nước S1: ${noteS1}`;
  }
  if (adjS2 !== 0) {
    sheet.getCell("Y73").value = { formula: `(X73-W73)+(${adjS2})` };
  }
  if (noteS2) {
    sheet.getCell("Y73").note = `Lý do hiệu chỉnh nước S2: ${noteS2}`;
  }
}

function fillDailyFallbacks(sheet: ExcelJS.Worksheet, row: Record<string, string>) {
  setNumber(sheet, CTKTKT_INSTALLED_CAPACITY_CELL, Number(CTKTKT_INSTALLED_CAPACITY_MW));
  const value = (code: string) => numeric(row[code]);
  const B = value("B"), C = value("C"), H = value("H"), I = value("I");
  const AE = value("AE"), AF = value("AF"), AJ = value("AJ"), CJ = value("CJ");
  setNumber(sheet, "J157", B === null ? null : B * 1000);
  setNumber(sheet, "K157", C === null ? null : C * 1000);
  setNumber(sheet, "J158", H === null ? null : H * 1000);
  setNumber(sheet, "K158", I === null ? null : I * 1000);
  if (CJ !== null) for (const target of ["AJ87", "AJ88", "AJ89", "AJ90", "AJ91", "AJ92"]) setNumber(sheet, target, CJ);
  if (AJ !== null) {
    const dryKcal = AJ / 4.1868 / (CJ === null ? 1 : 1 - CJ / 100);
    for (const target of ["AK87", "AK88", "AK89", "AK90", "AK91", "AK92"]) setNumber(sheet, target, dryKcal);
  }
  const calculated = calculateDailyProduction(row);
  setNumber(sheet, "D181", B === null || H === null ? null : B + H);
  setNumber(sheet, "F181", C === null || I === null ? null : C + I);
  setNumber(sheet, "K181", calculated.P === null ? null : calculated.P / 1000);
  setNumber(sheet, "L181", calculated.Q);
  setNumber(sheet, "M181", AE === null || AF === null ? null : (AE + AF) / 1_000_000);
  setNumber(sheet, "N181", calculated.U);
  setNumber(sheet, "O181", calculated.AA);
  setNumber(sheet, "P181", calculated.V);
  setNumber(sheet, "Q181", calculated.W);
}

function applyDateLabels(sheet: ExcelJS.Worksheet, date: string, isDaySheet: boolean) {
  const display = date.split("-").reverse().join("/");
  for (const cell of ctktktDateLabelCells(isDaySheet)) sheet.getCell(cell).value = display;
  sheet.getCell("AE83").value = `Ngày ${display.slice(0, 5)}`;
  sheet.getCell("N68").value = `Mức bồn 00h00 ${display}`;
  sheet.getCell("O68").value = `Mức bồn 24h00 ${display}`;
}

function normalizeCoalMeterFormulas(sheet: ExcelJS.Worksheet, previousSheetName: string) {
  const previous = `'${previousSheetName.replaceAll("'", "''")}'`;
  sheet.getCell("X28").value = { formula: `SUM(X16:X27)-SUM(${previous}!AB16:AB27)` };
  sheet.getCell("Z28").value = { formula: "SUM(Z16:Z27)-SUM(X16:X27)" };
  sheet.getCell("AB28").value = { formula: "SUM(AB16:AB27)-SUM(Z16:Z27)" };
  sheet.getCell("AH28").value = { formula: `SUM(AH16:AH27)-SUM(${previous}!AL16:AL27)` };
  sheet.getCell("AJ28").value = { formula: "SUM(AJ16:AJ27)-SUM(AH16:AH27)" };
  sheet.getCell("AL28").value = { formula: "SUM(AL16:AL27)-SUM(AJ16:AJ27)" };
}

export async function exportReport(request: Request) {
  const period = new URL(request.url).searchParams.get("period") || "";
  if (!periodPattern.test(period)) return Response.json({ error: "Tháng không hợp lệ." }, { status: 400 });
  const today = vietnamDateIso();
  if (period > today.slice(0, 7)) {
    return Response.json({ error: "Chưa thể xuất dữ liệu cho tháng trong tương lai." }, { status: 400 });
  }
  try {
    const workbook = await buildCtktktWorkbook(period);
    const output = new Uint8Array(await workbook.xlsx.writeBuffer());
    return new Response(output, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="CHI_TIEU_KTKT_${period}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Không xuất được file Chỉ tiêu KTKT.", error);
    return Response.json({ error: "Không xuất được file Chỉ tiêu KTKT." }, { status: 500 });
  }
}

/** Internal report builder shared by Excel downloads and the authenticated Sheets mirror. */
export async function buildCtktktWorkbook(period: string, presentation = true) {
  if (!periodPattern.test(period)) throw new Error("Tháng không hợp lệ.");
  const today = vietnamDateIso();
  if (period > today.slice(0, 7)) throw new Error("Tháng trong tương lai.");
    const { year, month, previous, next } = monthBounds(period);
    const throughExclusive = period === today.slice(0, 7) ? addDaysIso(today, 1) : next;
    const db = getRawDb();
    await ensureWaterSchema(db);
    const [{ results }, { results: shiftResults }, { results: waterResults }, operatingHours] = await Promise.all([
      db.prepare(
        "SELECT operating_date AS operatingDate, field_code AS fieldCode, value FROM daily_inputs WHERE operating_date >= ? AND operating_date < ? ORDER BY operating_date, field_code",
      ).bind(previous, throughExclusive).all(),
      db.prepare(
        "SELECT operating_date AS operatingDate, unit, time_slot AS timeSlot, metric, value FROM shift_readings WHERE operating_date >= ? AND operating_date < ? ORDER BY operating_date, unit, time_slot, metric",
      ).bind(previous, throughExclusive).all(),
      db.prepare(
        "SELECT log_date AS logDate, shift_time AS shiftTime, water_rec_s1 AS waterRecS1, water_rec_s2 AS waterRecS2, resin_water_s1_24h AS resinWaterS1_24h, resin_water_s2_24h AS resinWaterS2_24h FROM water_shift_logs WHERE log_date >= ? AND log_date < ? ORDER BY log_date, CASE shift_time WHEN '06h00' THEN 1 WHEN '14h00' THEN 2 WHEN '22h00' THEN 3 ELSE 9 END",
      ).bind(previous, throughExclusive).all(),
      // Operating hours are accumulated from the QLKT daily hours since 01/01/2026.
      loadCtktktOperatingHours(db, previous, throughExclusive),
    ]);

    const byDate = new Map<string, Record<string, string>>();
    for (const item of results as { operatingDate: string; fieldCode: string; value: string }[]) {
      const row = byDate.get(item.operatingDate) || {};
      row[item.fieldCode] = item.value;
      byDate.set(item.operatingDate, row);
    }
    const readingsByDate = new Map<string, CtktktBcsxReading[]>();
    for (const reading of shiftResults as CtktktBcsxReading[]) {
      const date = reading.operatingDate || "";
      const list = readingsByDate.get(date) || [];
      list.push(reading);
      readingsByDate.set(date, list);
    }
    const waterLogs = (waterResults as Record<string, unknown>[]).map(ctktktWaterLogFromRow);

    // Hourly meters and tank levels left blank keep the latest earlier reading, as the source
    // workbook does by copying the previous day's sheet.
    const sortedDates = [...byDate.keys()].sort();
    const applyCarryForward = (sheet: ExcelJS.Worksheet, date: string, row: Record<string, string>) => {
      for (const cell of CTKTKT_CARRY_FORWARD_INPUT_CELLS) {
        if (numeric(row[`KTKT:${cell}`]) !== null) continue;
        for (let index = sortedDates.length - 1; index >= 0; index -= 1) {
          if (sortedDates[index] >= date) continue;
          const earlier = numeric(byDate.get(sortedDates[index])?.[`KTKT:${cell}`]);
          if (earlier !== null) { sheet.getCell(cell).value = earlier; break; }
        }
      }
    };
    const applyOperatingHours = (sheet: ExcelJS.Worksheet, date: string) => {
      const totals = operatingHours.totalsByDate.get(date);
      for (const cell of CTKTKT_OPERATING_HOURS_CELLS) sheet.getCell(cell).value = totals ? totals[cell] : null;
    };

    const applyBcsxLinks = (sheet: ExcelJS.Worksheet, date: string) => {
      const linked = deriveCtktktCellsFromBcsx(readingsByDate.get(date) || []);
      for (const [cell, value] of Object.entries(linked.entries)) setNumber(sheet, cell, numeric(value));
    };
    const applyWaterLinks = (sheet: ExcelJS.Worksheet, date: string) => {
      for (const [cell, value] of Object.entries(deriveCtktktCellsFromWater(waterLogs, date))) {
        const curVal = sheet.getCell(cell).value;
        if (curVal === null || curVal === undefined || curVal === 0 || curVal === "" || Number(value) > 0) {
          setNumber(sheet, cell, numeric(value));
        }
      }
    };

    const workbook = new ExcelJS.Workbook();
    const templateBytes = Uint8Array.from(atob(CTKTKT_TEMPLATE_BASE64), character => character.charCodeAt(0));
    await workbook.xlsx.load(templateBytes.buffer);
    sanitizeCtktktTemplate(workbook);
    const inputCells = [
      ...CTKTKT_DAY03_INPUT_CELLS,
      ...CTKTKT_EXTRA_INPUT_FIELDS.map(field => field.cell),
    ].filter(cell => !CTKTKT_NON_WORKBOOK_INPUT_CELLS.has(cell) && !legacyOperationEventInputCells.has(cell));
    const exportableCells = new Set<string>(inputCells);
    for (const sheetName of ["d-1", ...Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, "0"))]) {
      const sheet = workbook.getWorksheet(sheetName);
      if (!sheet) continue;
      for (const cell of inputCells) sheet.getCell(cell).value = null;
      if (/^\d{2}$/.test(sheetName)) applyCtktktOperationEventLayout(sheet);
    }

    const previousSheet = workbook.getWorksheet("d-1");
    const previousRow = byDate.get(previous);
    if (previousSheet) {
      if (previousRow) fillDailyFallbacks(previousSheet, previousRow);
      // Seeds the W86 → W89 coal stock chain of the month with the QLKT stock when not entered.
      setNumber(previousSheet, "W86", numeric(previousRow?.AR));
      prepareCtktktPreviousMonthSheet(previousSheet, "01");
      for (const [code, value] of Object.entries(previousRow || {})) if (code.startsWith("KTKT:") && exportableCells.has(code.slice(5)) && !CTKTKT_BCSX_LINKED_CELLS.has(code.slice(5)) && !CTKTKT_WATER_LINKED_CELLS.has(code.slice(5))) {
        const cell = code.slice(5);
        previousSheet.getCell(cell).value = cell === "T181" ? value : numeric(value);
      }
      for (const cell of ["E39", "H39"]) if (numeric(previousRow?.[`KTKT:${cell}`]) === null) setNumber(previousSheet, cell, CTKTKT_GRINDING_BALL_DEFAULT);
      applyOperatingHours(previousSheet, previous);
      applyBcsxLinks(previousSheet, previous);
      applyWaterLinks(previousSheet, previous);
      applyWaterAdjustments(previousSheet, previousRow || {});
      applyCoalAdjustmentNotes(previousSheet, previousRow || {});
      applyCtktktCoalAdjustments(previousSheet, previousRow || {});
      applyDateLabels(previousSheet, previous, false);
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${period}-${String(day).padStart(2, "0")}`;
      const sheet = workbook.getWorksheet(String(day).padStart(2, "0"));
      if (!sheet) continue;
      if (date > today) continue;
      const previousSheetName = day === 1 ? "d-1" : String(day - 1).padStart(2, "0");
      normalizeCoalMeterFormulas(sheet, previousSheetName);
      prepareCtktktDaySheet(sheet, day < daysInMonth ? String(day + 1).padStart(2, "0") : null);
      const row = byDate.get(date) || {};
      fillDailyFallbacks(sheet, row);
      for (const [code, value] of Object.entries(row)) if (code.startsWith("KTKT:") && exportableCells.has(code.slice(5)) && !CTKTKT_BCSX_LINKED_CELLS.has(code.slice(5)) && !CTKTKT_WATER_LINKED_CELLS.has(code.slice(5))) {
        const cell = code.slice(5);
        sheet.getCell(ctktktExportCell(cell, true)).value = cell === "T181" ? value : numeric(value);
      }
      const previousDate = day === 1
        ? previous
        : `${period}-${String(day - 1).padStart(2, "0")}`;
      applyCtktktDailyCarryovers(sheet, row, byDate.get(previousDate), previousSheetName);
      applyCarryForward(sheet, date, row);
      applyCtktktCoalAdjustments(sheet, row);
      applyOperatingHours(sheet, date);
      applyNh3StartLevelCarryover(sheet, byDate.get(previousDate));
      const events = Object.hasOwn(row, `KTKT:${CTKTKT_OPERATION_EVENTS_CELL}`)
        ? row[`KTKT:${CTKTKT_OPERATION_EVENTS_CELL}`]
        : legacyCtktktOperationEvents(row, date);
      applyCtktktOperationEvents(sheet, events);
      applyBcsxLinks(sheet, date);
      applyWaterLinks(sheet, date);
      applyWaterAdjustments(sheet, row);
      applyCoalAdjustmentNotes(sheet, row);
      applyDateLabels(sheet, date, true);
    }
    const totalSheet = workbook.getWorksheet("Tổng hợp tháng");
    if (totalSheet) totalSheet.getCell("A1").value = `Tổng hợp tháng ${month}/${year}`;
    guardExportZeroDivisions(workbook);
    workbook.calcProperties.fullCalcOnLoad = true;
    // The Sheets mirror writes only values/formulas into its existing template.
    // Excel-only font, fill and print work is unnecessary for that projection.
    if (presentation) {
      applyCtktktExportPresentation(workbook);
      hideCtktktExportScratchArea(workbook);
    }
    return workbook;
}
