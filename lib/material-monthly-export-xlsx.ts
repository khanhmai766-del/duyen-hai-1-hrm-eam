import ExcelJS from "exceljs";
import type { MonthlyReportResult } from "@/lib/material-monthly-report";

/**
 * Xuất biểu QLVT.20 để nộp Phòng KHVT — chạy PHÍA SERVER bằng exceljs.
 *
 * Giữ ĐÚNG bố cục bản đang dùng, vì file này đi ra ngoài phân xưởng và người nhận đối chiếu
 * theo thói quen cũ:
 *   - khối tiêu đề 15 dòng đầu, mã biểu QLVT.20 ở cột J dòng 7;
 *   - dòng 15 là tiêu đề cột A–L, dòng 16 gắn thêm lưới T1..T12 ở cột M–X;
 *   - ba nhóm I / II / III mỗi nhóm một dòng tiêu đề chiếm cột A.
 *
 * Khác bản gõ tay đúng một điểm: các cột E, F, G, I, K và lưới T1..T12 là số hệ thống tính ra,
 * nên G luôn bằng E − F và lưới luôn khớp cột F.
 */

const thin = { style: "thin" as const, color: { argb: "FF9AA5B1" } };
const BORDER = { top: thin, left: thin, right: thin, bottom: thin };

const MONTH_COLUMNS = 12;
/** A..L là 12 cột dữ liệu, M..X là 12 ô lưới tháng. */
const HEADER_ROW = 15;
const GRID_ROW = 16;
const FIRST_DATA_ROW = 17;

const COLUMN_HEADERS = [
  "STT",
  "MÃ VẬT TƯ",
  "TÊN QUY CÁCH VẬT TƯ",
  "ĐVT",
  "Kế hoạch trong năm",
  "Luỹ kế số lượng đã sử dụng",
  "Số lượng còn lại so với kế hoạch",
  "Số lượng yêu cầu trong tháng",
  "Số lượng tồn kho",
  "Mục đích, vị trí sử dụng",
  "Tồn tại kho P.KHVT",
  "Người đề xuất",
];

const COLUMN_WIDTHS = [6, 24, 42, 8, 14, 14, 14, 14, 12, 40, 14, 18];

export function buildMonthlyReportWorkbook(report: MonthlyReportResult) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PowerPlant EAM — Phân xưởng Vận hành 1";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(`Tháng ${report.month}.${report.year}`, {
    views: [{ state: "frozen", ySplit: GRID_ROW }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  COLUMN_WIDTHS.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  for (let index = 0; index < MONTH_COLUMNS; index += 1) {
    sheet.getColumn(COLUMN_WIDTHS.length + index + 1).width = 5;
  }

  const setCell = (row: number, col: number, value: ExcelJS.CellValue, bold = false) => {
    const cell = sheet.getCell(row, col);
    cell.value = value;
    if (bold) cell.font = { bold: true };
    return cell;
  };

  // --- khối tiêu đề, giữ nguyên vị trí của bản gốc ---
  setCell(1, 1, "CÔNG TY NHIỆT ĐIỆN DUYÊN HẢI", true);
  setCell(2, 1, "PHÂN XƯỞNG VẬN HÀNH 1", true);
  setCell(7, 1, "CÔNG TY NHIỆT ĐIỆN\nDUYÊN HẢI", true).alignment = { wrapText: true };
  setCell(7, 10, "QLVT.20", true).alignment = { horizontal: "center" };
  setCell(8, 1, "PHÂN XƯỞNG VẬN HÀNH 1", true);
  setCell(9, 1, "Số:            VH1");
  const title = setCell(10, 2, "BIỂU TỔNG HỢP NHU CẦU VẬT TƯ", true);
  title.font = { bold: true, size: 14 };
  setCell(11, 2, `THÁNG ${report.month} NĂM ${report.year}`, true);
  setCell(12, 2, "Phân xưởng Vận hành 1");
  setCell(13, 2, `Theo kế hoạch sửa chữa Tháng ${report.month}.${report.year}`);

  // --- tiêu đề cột ---
  COLUMN_HEADERS.forEach((label, index) => {
    const cell = setCell(HEADER_ROW, index + 1, label, true);
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    cell.border = BORDER;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF4" } };
    // Cột A–L trải xuống dòng lưới để hai dòng tiêu đề thành một khối.
    sheet.mergeCells(HEADER_ROW, index + 1, GRID_ROW, index + 1);
  });
  for (let index = 0; index < MONTH_COLUMNS; index += 1) {
    const cell = setCell(GRID_ROW, COLUMN_WIDTHS.length + index + 1, `T${index + 1}`, true);
    cell.alignment = { horizontal: "center" };
    cell.border = BORDER;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF4" } };
  }

  let rowIndex = FIRST_DATA_ROW;
  let stt = 0;
  for (const group of report.groups) {
    if (group.rows.length === 0) continue;
    const groupCell = setCell(rowIndex, 1, group.group, true);
    groupCell.alignment = { vertical: "middle" };
    sheet.mergeCells(rowIndex, 1, rowIndex, COLUMN_WIDTHS.length + MONTH_COLUMNS);
    groupCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F6F9" } };
    rowIndex += 1;

    for (const row of group.rows) {
      stt += 1;
      const values: ExcelJS.CellValue[] = [
        stt,
        row.erpCode ?? "",
        row.materialNameLabel,
        row.unitLabel,
        row.plannedQuantity,
        row.usedQuantity,
        // G KHÔNG phải ô nhập: luôn bằng E − F.
        row.remainingQuantity,
        row.requestedQuantity ?? "",
        row.stockQuantity,
        row.purpose ?? "",
        row.stockQuantity,
        row.proposerName ?? "",
      ];
      values.forEach((value, index) => {
        const cell = setCell(rowIndex, index + 1, value);
        cell.border = BORDER;
        if (typeof value === "number") {
          cell.numFmt = "#,##0.####";
          cell.alignment = { horizontal: "right" };
        } else {
          cell.alignment = { wrapText: index === 2 || index === 9, vertical: "top" };
        }
      });
      row.monthMarks.forEach((marked, index) => {
        const cell = setCell(rowIndex, COLUMN_WIDTHS.length + index + 1, marked ? `T${index + 1}` : "");
        cell.border = BORDER;
        cell.alignment = { horizontal: "center" };
      });
      rowIndex += 1;
    }
  }

  return workbook;
}

export function monthlyReportFileName(report: MonthlyReportResult) {
  const month = String(report.month).padStart(2, "0");
  return `QLVT.20 Bieu tong hop nhu cau vat tu T${month}.${report.year}.xlsx`;
}
