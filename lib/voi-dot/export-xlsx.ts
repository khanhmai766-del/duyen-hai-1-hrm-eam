// Xuất Excel: mỗi tổ máy 1 sheet, bố cục phản chiếu sơ đồ vật lý
// (tường sau → KK dầu SCCN → KK dầu SCĐ → KK than → BUỒNG ĐỐT → … → tường trước).

import ExcelJS from "exceljs";
import { BACK, type UnitReport, type ReportCell } from "@/lib/voi-dot/report-model";
import type { DisplayStatus } from "@/lib/burner-status";

const ARGB = (hex: string) => "FF" + hex;

const HDR: Record<DisplayStatus, { fill: string; font: string }> = {
  available: { fill: "70AD47", font: "FFFFFF" },
  defect: { fill: "FFC000", font: "000000" },
  unavailable: { fill: "C00000", font: "FFFFFF" },
};
const TINT: Record<DisplayStatus, string> = { available: "E2EFDA", defect: "FFF2CC", unavailable: "FCE4D6" };
const LABEL = "C00000";
const CHAMBER = "2F5496";

const thin = { style: "thin" as const, color: { argb: ARGB("BFBFBF") } };
const BORDER = { top: thin, left: thin, right: thin, bottom: thin };

interface CellOpts {
  val?: string; bold?: boolean; size?: number; color?: string; fill?: string;
  wrap?: boolean; ha?: "left" | "center" | "right"; va?: "top" | "middle" | "bottom";
}
function styleCell(cell: ExcelJS.Cell, o: CellOpts = {}) {
  const { val = "", bold = false, size = 10, color = "000000", fill, wrap = true, ha = "center", va = "middle" } = o;
  cell.value = val;
  cell.font = { name: "Arial", bold, size, color: { argb: ARGB(color) } };
  if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB(fill) } };
  cell.alignment = { horizontal: ha, vertical: va, wrapText: wrap };
  cell.border = BORDER;
}
function colLetter(n: number) {
  let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s;
}
function today() {
  const d = new Date(); const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function writeSheet(wb: ExcelJS.Workbook, rep: UnitReport) {
  const ws = wb.addWorksheet(`Tổ máy ${rep.unit}`, {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  const N = BACK.length;                     // 18
  const first = 2, last = first + N - 1;     // B..S
  const noteC0 = last + 2, noteC1 = noteC0 + 2; // U..W

  ws.getColumn(1).width = 15;
  for (let c = first; c <= last; c++) ws.getColumn(c).width = 13.5;
  ws.getColumn(last + 1).width = 2;
  for (let c = noteC0; c <= noteC1; c++) ws.getColumn(c).width = 12;

  // Tiêu đề
  ws.mergeCells(1, 1, 1, noteC1);
  styleCell(ws.getCell(1, 1), {
    val: `KHIẾM KHUYẾT HỆ THỐNG VÒI ĐỐT HFO — TỔ MÁY ${rep.unit} — DH1  (ngày ${today()})`,
    bold: true, size: 13, wrap: false,
  });
  ws.getRow(1).height = 26;

  const label = (r: number, t: string) => styleCell(ws.getCell(r, 1), { val: t, bold: true, color: "FFFFFF", fill: LABEL });

  const headerRow = (r: number, cells: ReportCell[]) => {
    label(r, "Vòi dầu");
    cells.forEach((c, i) => {
      const h = HDR[c.status];
      styleCell(ws.getCell(r, first + i), {
        val: c.code + (c.force ? " (Force)" : ""),
        bold: true, size: 11, color: h.font, fill: h.fill,
      });
    });
    ws.getRow(r).height = 22;
  };

  const DEFECT_ROWS = {
    oilSccn: { label: "Khiếm khuyết vòi dầu (SCCN)", height: 80 },
    oilScd: { label: "Khiếm khuyết vòi dầu (SCĐ)", height: 80 },
    coal: { label: "Khiếm khuyết vòi than", height: 70 },
  } as const;

  const defectRow = (r: number, cells: ReportCell[], key: keyof typeof DEFECT_ROWS) => {
    label(r, DEFECT_ROWS[key].label);
    cells.forEach((c, i) => {
      const val = key === "oilSccn" ? c.oilSccnText : key === "oilScd" ? c.oilScdText : c.coalText;
      const fill = key === "coal" ? TINT[c.coalStatus] : TINT[c.status];
      styleCell(ws.getCell(r, first + i), { val, size: 9, ha: "left", va: "top", fill });
    });
    ws.getRow(r).height = DEFECT_ROWS[key].height;
  };

  // Nửa trên (tường sau)
  headerRow(2, rep.back);
  defectRow(3, rep.back, "oilSccn");
  defectRow(4, rep.back, "oilScd");
  defectRow(5, rep.back, "coal");

  // Thanh buồng đốt
  const chamberR = 6;
  ws.mergeCells(chamberR, first, chamberR, last);
  for (let c = first; c <= last; c++) {
    const cc = ws.getCell(chamberR, c);
    cc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB(CHAMBER) } };
    cc.border = BORDER;
  }
  const ch = ws.getCell(chamberR, first);
  ch.value = `BUỒNG ĐỐT ${rep.unit}`;
  ch.font = { name: "Arial", bold: true, size: 16, color: { argb: ARGB("FFFFFF") } };
  ch.alignment = { horizontal: "center", vertical: "middle" };
  const aCh = ws.getCell(chamberR, 1);
  aCh.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB(CHAMBER) } };
  aCh.border = BORDER;
  ws.getRow(chamberR).height = 40;

  // Nửa dưới (tường trước)
  defectRow(7, rep.front, "oilSccn");
  defectRow(8, rep.front, "oilScd");
  defectRow(9, rep.front, "coal");
  headerRow(10, rep.front);

  // Ô ghi chú bên phải (gộp dọc)
  ws.mergeCells(2, noteC0, 10, noteC1);
  styleCell(ws.getCell(2, noteC0), { val: rep.note, size: 10, ha: "left", va: "top", fill: "FFFFFF" });
  for (let r = 2; r <= 10; r++) for (let c = noteC0; c <= noteC1; c++) ws.getCell(r, c).border = BORDER;

  // Chú thích màu
  const lr = 12;
  styleCell(ws.getCell(lr, 1), { val: "Chú thích:", bold: true, ha: "left", wrap: false });
  const legend: [string, string, string][] = [
    ["Khả dụng", "70AD47", "FFFFFF"],
    ["Có khiếm khuyết", "FFC000", "000000"],
    ["Không khả dụng", "C00000", "FFFFFF"],
    ["(Force) Cần force tín hiệu lửa", "FFFFFF", "C00000"],
  ];
  legend.forEach(([t, f, fo], i) => {
    const cc = 2 + i * 3;
    ws.mergeCells(lr, cc, lr, cc + 2);
    styleCell(ws.getCell(lr, cc), { val: t, bold: true, size: 9, color: fo, fill: f, wrap: false });
  });
  ws.getRow(lr).height = 20;

  ws.pageSetup.printArea = `A1:${colLetter(noteC1)}${lr}`;
}

/** Dựng workbook (mỗi tổ máy 1 sheet), trả về Uint8Array để đưa thẳng vào Response. */
export async function buildBurnerWorkbook(units: UnitReport[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DH1 Digital Operations";
  wb.created = new Date();
  units.forEach((u) => writeSheet(wb, u));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
