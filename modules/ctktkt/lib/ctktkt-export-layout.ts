import type ExcelJS from "exceljs";

const STEAM_COLUMNS = ["W", "X", "Y", "Z", "AA", "AB", "AG", "AH", "AI", "AJ", "AK", "AL"];

// Cumulative steam meters are stored at row 54 (source workbook layout).
export const CTKTKT_STEAM_METER_CELLS = new Set(STEAM_COLUMNS.map(column => `${column}54`));

export const CTKTKT_GRINDING_BALL_DEFAULT = 150;

// The embedded template's day sheets carried the steam block one row lower than the source
// workbook; sanitizeCtktktTemplate now moves it back, so every sheet uses the source cells.
export function ctktktExportCell(cell: string, _isDaySheet?: boolean): string {
  return cell;
}

function quoted(sheetName: string) {
  return `'${sheetName.replaceAll("'", "''")}'`;
}

function numeric(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function setFormula(sheet: ExcelJS.Worksheet, cell: string, formula: string) {
  sheet.getCell(cell).value = { formula };
}

const DAY_SHEET = /^\d{2}$/;
const EXTERNAL_REF = /\[\d+\]/;

function isSharedFormula(value: ExcelJS.CellValue) {
  return !!value && typeof value === "object" && ("sharedFormula" in value || "shareType" in value);
}

/**
 * Repairs defects of the embedded template that the source workbook does not have:
 * external workbook links, the E1360 typo, S2 oil meters shown in kg instead of tonnes
 * and the month-to-date column J that chained through "d-1" into previous months.
 */
export function sanitizeCtktktTemplate(workbook: ExcelJS.Workbook) {
  for (const sheet of workbook.worksheets) {
    // ExcelJS reads a conditional-format numFmt as { id, formatCode } but writes it back as a string,
    // producing formatCode="[object Object]" that makes Excel refuse to open the file.
    const conditional = (sheet as unknown as { conditionalFormattings?: Array<{ rules: ExcelJS.ConditionalFormattingRule[] }> }).conditionalFormattings;
    for (const rule of conditional?.flatMap(item => item.rules) ?? []) {
      const style = rule.style as { numFmt?: unknown } | undefined;
      if (!style || !("numFmt" in style) || typeof style.numFmt === "string") continue;
      const formatCode = (style.numFmt as { formatCode?: unknown } | null)?.formatCode;
      if (typeof formatCode === "string") style.numFmt = formatCode;
      else delete style.numFmt;
    }
    const isPreviousMonth = sheet.name === "d-1";
    const isDaySheet = DAY_SHEET.test(sheet.name);
    // Read every (translated) formula before editing so shared-formula clones never lose their master.
    const formulas: Array<{ cell: ExcelJS.Cell; formula: string; shared: boolean }> = [];
    sheet.eachRow(row => row.eachCell(cell => {
      if (cell.formula) formulas.push({ cell, formula: cell.formula, shared: isSharedFormula(cell.value) });
    }));
    for (const { cell, formula, shared } of formulas) {
      let next: string | null = formula.replaceAll("'[2]16'!", "'16'!").replaceAll("E1360", "E139");
      if (isPreviousMonth && EXTERNAL_REF.test(next)) next = null;
      else if (isDaySheet && cell.address === "G4" && next === "AL13") next = "AL13/1000";
      else if (isDaySheet && cell.address === "G5" && next === "AL14") next = "AL14/1000";
      else if (sheet.name === "01") next =next.replace(/^I(\d+)\+#REF!J\1$/, "I$1+'d-1'!J$1");
      // The source never qualifies a reference to its own sheet (e.g. AG15 "'25'!AG14").
      if (next !== null && isDaySheet) next = next.replaceAll(`${quoted(sheet.name)}!`, "");
      if (next === formula && !shared) continue;
      cell.value = next === null ? null : { formula: next };
    }
    // Source order: row 144 = "Phần trăm điện tự dùng", row 145 = "Tỷ lệ … tổn thất MBA".
    if (isDaySheet && String(sheet.getCell("B145").value).startsWith("Phần trăm điện tự dùng")) {
      for (let column = 2; column <= 9; column += 1) {
        const upper = sheet.getRow(144).getCell(column);
        const lower = sheet.getRow(145).getCell(column);
        const value = upper.value;
        upper.value = lower.value;
        lower.value = value;
      }
    }
  }
  for (const sheet of workbook.worksheets) if (DAY_SHEET.test(sheet.name)) applySourceDayLayout(sheet);
  // Month-to-date totals and running balances start from zero on day 01.
  workbook.getWorksheet("d-1")?.getColumn(10).eachCell(cell => {
    if (cell.formula) cell.value = null;
  });
}

const SHIFT_HOURS = [6, 10, 14, 18, 22, 24];
const HOURLY_COLUMNS = ["M", "N", "O", "P", "Q", "R"];

export const CTKTKT_SUB_BITUMINOUS_MOISTURE = 24.421265114971156;

function copyCell(sheet: ExcelJS.Worksheet, from: string, to: string) {
  const source = sheet.getCell(from);
  const target = sheet.getCell(to);
  target.value = source.value;
  target.style = JSON.parse(JSON.stringify(source.style ?? {}));
}

/**
 * Brings a template day sheet to the layout and formulas the source workbook uses on
 * (almost) every day: steam block at rows 53–60, shift statistics, HFO headers,
 * Sub-bitum constants and the side calculations next to the daily report.
 */
function applySourceDayLayout(sheet: ExcelJS.Worksheet) {
  const blockColumns = ["V", "W", "X", "Y", "Z", "AA", "AB", "AC", "AF", "AG", "AH", "AI", "AJ", "AK", "AL"];
  // Steam block: template rows 54–61 → source rows 53–60.
  for (let row = 53; row <= 60; row += 1) for (const column of blockColumns) copyCell(sheet, `${column}${row + 1}`, `${column}${row}`);
  for (const column of blockColumns) sheet.getCell(`${column}61`).value = null;
  for (const [label, columns] of [["S1", ["W", "X", "Y", "Z", "AA", "AB"]], ["S2", ["AG", "AH", "AI", "AJ", "AK", "AL"]]] as const) {
    sheet.getCell(label === "S1" ? "V53" : "AF53").value = label;
    columns.forEach((column, index) => {
      sheet.getCell(`${column}53`).value = SHIFT_HOURS[index];
      setFormula(sheet, `${column}55`, index === 0 ? `${column}54` : `${column}54-${columns[index - 1]}54`);
    });
    sheet.getCell(label === "S1" ? "Z56" : "AJ56").value = null;
    const [w, x, y, z, aa, ab] = columns;
    setFormula(sheet, `${w}58`, `${x}55+${y}55`);
    setFormula(sheet, `${x}58`, `${z}55+${aa}55`);
    setFormula(sheet, `${z}58`, `${ab}54`);
    const gross = label === "S1" ? "E20" : "H20";
    const net = label === "S1" ? "E21" : "H21";
    for (const column of [w, x, y]) {
      setFormula(sheet, `${column}59`, `(${column}58*10^6)/(${column}41*1000)`);
      setFormula(sheet, `${column}60`, `(${column}58*10^6)/(${column}42*1000)`);
    }
    setFormula(sheet, `${z}59`, `(${z}58*10^6)/(${gross}*1000)`);
    setFormula(sheet, `${z}60`, `(${z}58*10^6)/(${net}*1000)`);
  }

  // Shift statistics: the source takes the 16h/18h columns against the previous reading column.
  for (const [end, start] of [["Z", "Y"], ["AJ", "AI"]] as const) {
    setFormula(sheet, `${end}30`, `(${end}8-${start}8)`);
    setFormula(sheet, `${end}31`, `${end}10-${start}10`);
    setFormula(sheet, `${end}32`, `${end}11-${start}11`);
    setFormula(sheet, `${end}34`, `${end}9-${start}9`);
  }
  for (const column of ["Y", "Z", "AA", "AI", "AJ", "AK"]) setFormula(sheet, `${column}33`, `${column}32+${column}31`);
  for (const column of ["Y", "Z", "AA"]) setFormula(sheet, `${column}35`, `(${column}28*10^6)/(${column}30*1000)`);

  // HFO tank table headers (the template ships sample readings, never headers).
  HOURLY_COLUMNS.forEach((column, index) => { sheet.getCell(`${column}51`).value = SHIFT_HOURS[index]; });
  for (const [cell, hour] of [["M58", 6], ["O58", 14], ["Q58", 22]] as const) sheet.getCell(cell).value = hour;
  HOURLY_COLUMNS.forEach((column, index) => { sheet.getCell(`${column}59`).value = index % 2 ? "Nhiệt độ" : "Mức dầu"; });

  // Legacy Sub-bitum blend inputs stay at the source constants (no blending, fixed moisture).
  for (let row = 87; row <= 92; row += 1) {
    sheet.getCell(`AL${row}`).value = 0;
    sheet.getCell(`AO${row}`).value = CTKTKT_SUB_BITUMINOUS_MOISTURE;
  }

  // Side calculations the source keeps next to the daily report.
  const side: Array<[string, string]> = [
    ["H157", "E157/24"], ["H158", "E158/24"], ["H159", "F157/24"], ["H160", "F158/24"],
    ["H162", "F162-E162"], ["I162", "E161-F161"], ["I163", "(E162+F162)/2"], ["J163", "E159-F159"],
    ["L159", "L158-L157"], ["L160", "J158+J157"], ["L161", "K158+K157"], ["L162", "L158+L157+I24"],
  ];
  for (const [cell, formula] of side) setFormula(sheet, cell, formula);
}

function applyNightShiftFormulas(sheet: ExcelJS.Worksheet, next: string | null, steamRow: number) {
  const ref = next ? `${quoted(next)}!` : null;
  const shifted = (meterRow: number, s1: boolean) => {
    const start = s1 ? "W" : "AG";
    const end22 = s1 ? "AA" : "AK";
    const end24 = s1 ? "AB" : "AL";
    return ref ? `${ref}${start}${meterRow}-${end22}${meterRow}` : `${end24}${meterRow}-${end22}${meterRow}`;
  };
  for (const [s1, column] of [[true, "Y"], [false, "AI"]] as const) {
    for (const meterRow of [8, 9, 10, 11]) setFormula(sheet, `${column}${41 + meterRow - 8}`, shifted(meterRow, s1));
    const coal24 = s1 ? "AB28" : "AL28";
    setFormula(sheet, `${column}46`, ref ? `${coal24}+${ref}${s1 ? "W28" : "AG28"}` : coal24);
    // Steam per-shift rates divide by the shift generation rows 41 (gross) and 42 (net).
    const steamTotal = `${column}${steamRow}`;
    setFormula(sheet, `${column}${steamRow + 1}`, `(${steamTotal}*10^6)/(${column}41*1000)`);
    setFormula(sheet, `${column}${steamRow + 2}`, `(${steamTotal}*10^6)/(${column}42*1000)`);
    // Row 55 holds the per-interval steam consumption on every sheet (source layout).
    const lastInterval = `${s1 ? "AB" : "AL"}55`;
    const nextStart = `${s1 ? "W" : "AG"}55`;
    setFormula(sheet, steamTotal, ref ? `${lastInterval}+${ref}${nextStart}` : lastInterval);
  }
}

/** Removes sample values baked into the template and repoints the night-shift formulas to day D+1. */
export function prepareCtktktDaySheet(sheet: ExcelJS.Worksheet, nextSheetName: string | null) {
  for (const column of STEAM_COLUMNS) sheet.getCell(`${column}54`).value = null;
  for (const cell of ["W49", "X49", "Y49", "AG49", "AH49", "AI49"]) sheet.getCell(cell).value = null;
  // Night shift = 22h–24h of day D plus 0h–6h of day D+1.
  applyNightShiftFormulas(sheet, nextSheetName, 58);
}

export function prepareCtktktPreviousMonthSheet(sheet: ExcelJS.Worksheet, firstDaySheetName: string) {
  applyNightShiftFormulas(sheet, firstDaySheetName, 58);
}

/**
 * Carries day D-1 values into day D the same way the web report does:
 * coal stock W86 = W89 of D-1 (entered only on day 01), demin meters W72/W73 = X72/X73 of D-1
 * when left blank, NH3 24h stock P74 = sum of the three tanks when not entered.
 * W87 (coal received, known only after 06h of D+1) is entered separately and never derived.
 */
export function applyCtktktDailyCarryovers(
  sheet: ExcelJS.Worksheet,
  row: Record<string, string>,
  previousRow: Record<string, string> | undefined,
  previousSheetName: string,
) {
  const isFirstDay = sheet.name === "01";
  if (!isFirstDay || numeric(row["KTKT:W86"]) === null) setFormula(sheet, "W86", `${quoted(previousSheetName)}!W89`);
  for (const [start, end] of [["W72", "X72"], ["W73", "X73"]] as const) {
    const carried = numeric(previousRow?.[`KTKT:${end}`]);
    if (numeric(row[`KTKT:${start}`]) === null && carried !== null) sheet.getCell(start).value = carried;
  }
  if (numeric(row["KTKT:P74"]) === null) setFormula(sheet, "P74", "P69+P70+P71");
  for (const cell of ["E39", "H39"]) {
    if (numeric(row[`KTKT:${cell}`]) === null) sheet.getCell(cell).value = CTKTKT_GRINDING_BALL_DEFAULT;
  }
  // Auxiliary electricity L157/L158 = gross − net. A unit that did not generate draws all of its
  // auxiliary power from the grid, which the source enters in L157/L158. While the unit runs,
  // the source keeps the grid-received energy beside the report (M157:M160) instead.
  for (const [cell, gross, net, code, dailyGross] of [
    ["L157", "J157", "K157", "GRID_RECEIVE_S1", "B"],
    ["L158", "J158", "K158", "GRID_RECEIVE_S2", "H"],
  ] as const) {
    const received = numeric(row[code]);
    const generated = numeric(row[dailyGross]);
    const running = generated !== null && generated > 0;
    setFormula(sheet, cell, received !== null && received > 0 && !running ? `${gross}-${net}+${received}` : `${gross}-${net}`);
    if (cell === "L157" && received !== null && received > 0 && running) {
      sheet.getCell("M157").value = "Tự dùng nhận lưới S1";
      sheet.getCell("M158").value = received;
      setFormula(sheet, "M159", "M158+L157");
      setFormula(sheet, "M160", "M159+L158+I24");
    }
  }
}

function signedConstant(value: number) {
  const text = String(Number(value.toPrecision(15)));
  return value < 0 ? text : `+${text}`;
}

/**
 * The web stores coal-scale corrections per shift in W/Y/AA28 (S1) and AG/AI/AK28 (S2).
 * The source workbook instead appends them as constants to the shift consumption formulas
 * (e.g. AB28 "=SUM(AB16:AB27)-SUM(Z16:Z27)+40.42") and to the mill rows, leaving W/Y/AA28 at 0,
 * so the export writes them the same way: X/Z/AB28 (AH/AJ/AL28) carry the correction and
 * E19/H19 add the unit total.
 */
export function applyCtktktCoalAdjustments(sheet: ExcelJS.Worksheet, row: Record<string, string>) {
  for (const [unitTotal, mills, pairs] of [
    ["E19", "E7:E18", [["W28", "X28"], ["Y28", "Z28"], ["AA28", "AB28"]]],
    ["H19", "H7:H18", [["AG28", "AH28"], ["AI28", "AJ28"], ["AK28", "AL28"]]],
  ] as const) {
    let total = 0;
    for (const [adjustmentCell, consumptionCell] of pairs) {
      const adjustment = numeric(row[`KTKT:${adjustmentCell}`]) ?? 0;
      sheet.getCell(adjustmentCell).value = 0;
      const formula = sheet.getCell(consumptionCell).formula;
      if (adjustment !== 0 && formula) setFormula(sheet, consumptionCell, `${formula}${signedConstant(adjustment)}`);
      total += adjustment;
    }
    setFormula(sheet, unitTotal, total === 0 ? `SUM(${mills})` : `SUM(${mills})${signedConstant(total)}`);
  }
}

/** Latest entered value on or before the day; operating hours persist until someone updates them. */
export function applyCtktktCarriedValues(sheet: ExcelJS.Worksheet, cells: readonly string[], latest: ReadonlyMap<string, number>) {
  for (const cell of cells) {
    const value = latest.get(cell);
    if (value !== undefined) sheet.getCell(cell).value = value;
  }
}

export function ctktktDateLabelCells(_isDaySheet?: boolean) {
  return ["Z57", "AJ57"];
}
