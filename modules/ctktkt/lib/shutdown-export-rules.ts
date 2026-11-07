import type ExcelJS from 'exceljs';

/** Apply the same reporting boundary as the web without changing measured inputs. */
export function applyShutdownExportRules(workbook: ExcelJS.Workbook) {
  for (const sheet of workbook.worksheets) {
    if (!/^\d{2}$/.test(sheet.name)) continue;
    const formula = (cell: string, value: string) => { sheet.getCell(cell).value = { formula: value }; };
    formula('I25', 'IF(COUNT(E20,H20)<2,"",IF(E20>0,E25,0)+IF(H20>0,H25,0))');
    formula('I27', 'IF(COUNT(E20,H20,E21,H21)<4,"",IF(E20+H20>0,(IF(E20>0,E20-E21,0)+IF(H20>0,H20-H21,0))/(E20+H20)*100,""))');
    // Summary rows must use adjusted coal consistently with the KPI table.
    formula('I169', 'IF(E21>0,AR94*1000/E21,"")');
    formula('K169', 'IF(E21>0,AR94*AT87/E21,"")');
    formula('L169', 'IF(I21>0,AR86*AT87/I21,"")');
    for (const row of [170, 172]) {
      const coal = row === 170 ? 'AR94' : 'AR95';
      formula(`I${row}`, `IF(E${row}>0,${coal}/E${row},"")`);
      formula(`K${row}`, `IF(E${row}>0,${coal}*AT87/E${row}/1000,"")`);
    }
    sheet.getCell('I25').note = 'Loại điện nhận lưới cấp cho tổ ngừng khỏi chỉ tiêu chung nhà máy; số riêng từng tổ được giữ nguyên.';
    sheet.getCell('K169').note = 'Suất hao theo than quy ẩm; điện giao <= 0: không tính, không đánh giá.';
    // Guard only division formulas; preserve unexpected errors for diagnosis.
    sheet.eachRow(row => row.eachCell(cell => {
      const value = cell.value;
      if (!value || typeof value !== 'object' || !('formula' in value) || !value.formula?.includes('/')) return;
      const f = value.formula;
      cell.value = { formula: `IF(IFERROR(ERROR.TYPE(${f}),0)=2,"",${f})` };
    }));
  }
}
