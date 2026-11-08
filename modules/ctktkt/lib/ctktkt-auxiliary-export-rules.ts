import type ExcelJS from 'exceljs';

/**
 * Giữ theo web mới (quyết định 08/11/2026): điện tự dùng toàn nhà máy I25 và tỷ lệ I27
 * loại phần điện nhận lưới cấp cho tổ ngừng, cùng cách tính với bảng chỉ tiêu trên web.
 * Mọi công thức khác giữ nguyên như web cũ. Gọi trước guardExportZeroDivisions.
 */
export function applyCtktktAuxiliaryExportRules(workbook: ExcelJS.Workbook) {
  for (const sheet of workbook.worksheets) {
    if (!/^\d{2}$/.test(sheet.name)) continue;
    sheet.getCell('I25').value = { formula: 'IF(COUNT(E20,H20)<2,"",IF(E20>0,E25,0)+IF(H20>0,H25,0))' };
    sheet.getCell('I27').value = { formula: 'IF(COUNT(E20,H20,E21,H21)<4,"",IF(E20+H20>0,(IF(E20>0,E20-E21,0)+IF(H20>0,H20-H21,0))/(E20+H20)*100,""))' };
    sheet.getCell('I25').note = 'Loại điện nhận lưới cấp cho tổ ngừng khỏi chỉ tiêu chung nhà máy; số riêng từng tổ được giữ nguyên.';
  }
}
