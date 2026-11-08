import type ExcelJS from 'exceljs';
import type {MirrorCell, MirrorTab} from './google-mirror';

/** Keep the exact mirror projection, without serializing and reparsing an XLSX ZIP. */
export function mirrorWorkbookTabs(workbook: ExcelJS.Workbook): MirrorTab[] {
  return workbook.worksheets.map(sheet => {
    // getRow() may leave trailing, completely empty rows in memory. The XLSX
    // writer omits those rows; use persisted row models to preserve old hashes.
    // ExcelJS 4.4 emits rows in its runtime model but omits them in its .d.ts.
    const persistedRows = (sheet.model as unknown as {rows?: Array<{number: number}>}).rows || [];
    const rowCount = persistedRows.reduce((last, row) => Math.max(last, row.number), 0);
    const rows: MirrorCell[][] = Array.from({length: Math.min(rowCount, 210)},
      () => Array<MirrorCell>(Math.min(sheet.columnCount, 49)).fill(null));
    sheet.eachRow(row => row.eachCell(cell => {
      if (Number(cell.row) > 210 || Number(cell.col) > 49
        || cell.isMerged && cell.master.address !== cell.address) return;
      let value: MirrorCell = null;
      if (cell.formula) value = {formula: cell.formula};
      else if (cell.value instanceof Date) value = cell.value.toLocaleDateString('en-GB', {timeZone: 'UTC'});
      else if (typeof cell.value === 'string' || typeof cell.value === 'number' || typeof cell.value === 'boolean') value = cell.value;
      else if (cell.value && typeof cell.value === 'object' && 'richText' in cell.value) value = cell.value.richText.map(run => run.text).join('');
      rows[Number(cell.row) - 1][Number(cell.col) - 1] = value;
    }));
    return {name: sheet.name, rows, clearRows: 210, clearColumns: 49};
  });
}
