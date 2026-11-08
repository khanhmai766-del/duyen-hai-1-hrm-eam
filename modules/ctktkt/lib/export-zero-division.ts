import type ExcelJS from 'exceljs';

/** Suppress DIV/0 only, retaining every successful value and all other errors. */
export function guardExportZeroDivisions(workbook: ExcelJS.Workbook) {
  for (const sheet of workbook.worksheets) {
    const formulas: Array<{cell: ExcelJS.Cell; formula: string}> = [];
    sheet.eachRow(row => row.eachCell(cell => {
      const formula = cell.formula;
      if (formula?.includes('/') && !formula.startsWith('IFERROR(')) formulas.push({cell, formula});
    }));
    for (const {cell, formula} of formulas) {
      cell.value = { formula: `IFERROR(${formula},IF(ERROR.TYPE(${formula})=2,"",${formula}))` };
    }
  }
}
