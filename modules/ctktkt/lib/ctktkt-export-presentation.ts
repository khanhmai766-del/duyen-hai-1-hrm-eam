import type ExcelJS from "exceljs";

const white: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
const yellow: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };

/** Presentation only: never change readings, formulas, cached results or number formats. */
export function applyCtktktExportPresentation(workbook: ExcelJS.Workbook) {
  for (const sheet of workbook.worksheets) {
    sheet.eachRow({ includeEmpty: true }, row => row.eachCell({ includeEmpty: true }, cell => {
      cell.font = { ...cell.font, name: "Times New Roman", family: 1, scheme: undefined };
      if (cell.value && typeof cell.value === "object" && "richText" in cell.value) {
        cell.value = { ...cell.value, richText: cell.value.richText.map(run => ({
          ...run, font: { ...run.font, name: "Times New Roman", family: 1, scheme: undefined },
        })) };
      }
      const eventTimeHeader = /^\d{2}$/.test(sheet.name) && [86, 92, 99, 106].includes(Number(cell.row))
        && ((Number(cell.col) >= 2 && Number(cell.col) <= (Number(cell.row) <= 92 ? 5 : 4))
          || (Number(cell.row) >= 99 && Number(cell.col) >= 6 && Number(cell.col) <= 8));
      if ((cell.value === null || cell.value === "") && !eventTimeHeader) cell.fill = white;
    }));

    // The replacement event table exists only on daily report sheets.
    if (!/^\d{2}$/.test(sheet.name)) continue;
    for (let row = 59; row <= 83; row += 1) {
      for (let column = 2; column <= 10; column += 1) {
        const cell = sheet.getRow(row).getCell(column);
        cell.border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } },
        };
        cell.font = {
          ...cell.font, name: "Times New Roman", size: 9,
          bold: row === 59 || column === 2, italic: false, color: { argb: "FF000000" },
        };
        cell.fill = row === 59 ? yellow : white;
        cell.alignment = {
          ...cell.alignment, horizontal: row === 59 || column > 2 ? "center" : "left",
          vertical: "middle", wrapText: true,
        };
      }
    }
    sheet.getRow(59).height = Math.max(sheet.getRow(59).height || 0, 48);
  }
}

/** Hide scratch areas while retaining all five report tables and their dependencies. */
export function hideCtktktExportScratchArea(workbook: ExcelJS.Workbook) {
  for (const sheet of workbook.worksheets) {
    if (!/^\d{2}$/.test(sheet.name)) continue;
    for (let row = 166; row <= sheet.rowCount; row += 1) sheet.getRow(row).hidden = row > 181;
    for (let row = 155; row <= 165; row += 1) {
      for (let column = 1; column <= sheet.columnCount; column += 1) {
        const inTable = (column >= 3 && column <= 7 && row <= 163)
          || (column >= 9 && column <= 12 && row <= 158)
          || ((column === 9 || column === 10) && row >= 159 && row <= 161)
          || (column >= 14 && column <= 18);
        if (inTable) continue;
        const cell = sheet.getRow(row).getCell(column);
        // Hide display only. Deleting these formulas would break the visible report.
        cell.numFmt = ";;;";
        cell.font = { ...cell.font, color: { argb: "FFFFFFFF" } };
        cell.fill = white;
        cell.border = {};
      }
    }
    sheet.pageSetup.printArea = `A1:${sheet.getColumn(sheet.columnCount).letter}181`;
  }
}
