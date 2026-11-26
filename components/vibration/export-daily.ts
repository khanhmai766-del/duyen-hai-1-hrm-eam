/** Bảng đo trong ngày: Excel / PDF dùng cho Theo kỳ, MNK theo ca, TBNT theo ca (chuyển từ daily-export.js của VibraControl cũ). */
import { VIB_LABELS } from "@/lib/vibration/constants";
import { statusFor, STATUS_LABEL } from "@/lib/vibration/severity";
import type { VibrationDeviceDto } from "@/lib/vibration/types";
import {
  buildWorkbookFiles, colLetter, dateSerial, displayDate, excelNumber, htmlEsc, safeFileName, sheetName, xmlEsc, zipFiles,
} from "./export-core";

export interface DailyRow {
  device: { system: string; name: string };
  /** power, measureTime, note, v0…v22 (mọi ô chữ/số hoặc rỗng). */
  row: Record<string, string | number | null | undefined>;
  person: string;
  status: string;
  origin: string;
}
export interface DailySheet {
  area: string;
  title?: string;
  labels: string[];
  extras: string[];
  rows: DailyRow[];
  /** Chỉ xuất các cột này (TBNT). */
  columnIndices?: number[];
  columnGroups?: [string, number, number][];
}

export const dailyFilename = (area: string, date: string, ext = "xlsx") =>
  `Bảng đo - ${safeFileName(area)} - ${displayDate(date).replace(/\//g, "-")}.${ext}`;

const widths = (labels: string[], extras: string[]) => [6, 14, 24, 34, 13, 11, ...labels.map(() => 14), ...extras.map(() => 17), 22, 32, 18, 14];
const columns = (labels: string[], extras: string[]) => [
  "STT", "Ngày đo", "Hệ thống", "Tên thiết bị", "Công suất tổ máy (MW)", "Giờ đo", ...labels, ...extras, "Người đo", "Nhận xét", "Trạng thái cảnh báo", "Nguồn dữ liệu",
];
const groups = (extras: string[]): [string, number, number][] => [
  ["THÔNG TIN CHUNG", 6, 2], ["DÒNG ĐIỆN ĐỘNG CƠ (A)", 3, 3], ["ĐỘNG CƠ · GỐI KT (NDE)", 5, 4], ["ĐỘNG CƠ · GỐI CT (DE)", 5, 4],
  ["QUẠT / BƠM · GỐI KT (NDE)", 5, 5], ["QUẠT / BƠM · GỐI CT (DE)", 5, 5],
  ...(extras.length ? ([["ĐIỂM ĐO BỔ SUNG", extras.length, 6]] as [string, number, number][]) : []),
  ["GHI NHẬN & ĐÁNH GIÁ", 4, 7],
];

function rowValues(item: DailyRow, labels: string[], extras: string[], i: number, date: string): unknown[] {
  const r = item.row;
  return [
    i + 1, date, item.device.system, item.device.name, r.power ?? "", r.measureTime ?? "",
    ...labels.map((_, j) => r[`v${j}`] ?? ""), ...extras.map((p) => r[p] ?? ""),
    item.person ?? "", r.note ?? "", item.status ?? "", item.origin ?? "",
  ];
}

function sheetXml(sheet: DailySheet, date: string) {
  const { labels, extras } = sheet;
  const allHeads = columns(labels, extras);
  const indices = sheet.columnIndices ?? allHeads.map((_, i) => i);
  const heads = indices.map((i) => allHeads[i]);
  const last = colLetter(heads.length);
  const merges = [`A1:${last}1`, `A2:${last}2`];
  const grid: string[] = [];
  const cell = (r: number, c: number, v: unknown, style = 0, kind: "text" | "date" | "number" = "text") => {
    const ref = colLetter(c) + r;
    if (v === null || v === undefined || v === "") return `<c r="${ref}" s="${style}"/>`;
    if (kind === "date") {
      const serial = dateSerial(String(v));
      if (serial !== null) return `<c r="${ref}" s="${style}"><v>${serial}</v></c>`;
    }
    if (kind === "number") {
      const n = excelNumber(v);
      if (n !== null) return `<c r="${ref}" s="${style}"><v>${n}</v></c>`;
    }
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  };
  grid.push(`<row r="1" ht="32" customHeight="1">${cell(1, 1, sheet.title || `BẢNG THEO DÕI ĐỘ RUNG, NHIỆT ĐỘ, DÒNG ĐIỆN · ${sheet.area}`, 1)}</row>`);
  grid.push(`<row r="2" ht="25" customHeight="1">${cell(2, 1, `PHÂN XƯỞNG VẬN HÀNH 1 - NĐDH   •   Ngày đo: ${displayDate(date)}   •   ${sheet.rows.length} thiết bị`, 8)}</row>`);
  grid.push('<row r="3" ht="10" customHeight="1"/>');
  let offset = 1;
  grid.push(
    `<row r="4" ht="29" customHeight="1">${(sheet.columnGroups ?? groups(extras))
      .map(([title, count, style]) => {
        const start = offset;
        offset += count;
        if (count > 1) merges.push(`${colLetter(start)}4:${colLetter(offset - 1)}4`);
        return cell(4, start, title, style);
      })
      .join("")}</row>`
  );
  grid.push(`<row r="5" ht="57" customHeight="1">${heads.map((h, j) => cell(5, j + 1, h, 9)).join("")}</row>`);
  sheet.rows.forEach((item, i) => {
    const r = i + 6;
    const all = rowValues(item, labels, extras, i, date);
    const values = indices.map((j) => all[j]);
    const base = i % 2 ? 11 : 10;
    grid.push(
      `<row r="${r}" ht="31" customHeight="1">${values
        .map((v, j) => {
          const status = j === values.length - 2;
          const style = status ? (v === "Nguy hiểm" ? 13 : v === "Cảnh báo" ? 12 : base) : j === 1 ? 14 : base;
          const kind = j === 1 ? "date" : indices[j] === 0 || indices[j] === 4 || (indices[j] >= 6 && indices[j] < 6 + labels.length + extras.length) ? "number" : "text";
          return cell(r, j + 1, v, style, kind);
        })
        .join("")}</row>`
    );
  });
  const footer = sheet.rows.length + 7;
  grid.push(`<row r="${footer}" ht="22" customHeight="1">${cell(footer, 1, "Ô trống = chưa đo; số 0 = giá trị đo bằng 0. “Bản nháp” chưa được lưu lên máy chủ.", 15)}</row>`);
  merges.push(`A${footer}:${last}${footer}`);
  const allWidths = widths(labels, extras);
  const cols = indices.map((j) => allWidths[j]).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane xSplit="4" ySplit="5" topLeftCell="E6" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="17"/><cols>${cols}</cols><sheetData>${grid.join("")}</sheetData><autoFilter ref="A5:${last}${Math.max(5, sheet.rows.length + 5)}"/><mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells><pageMargins left="0.2" right="0.2" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="8" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="4"><font><sz val="10"/><name val="Aptos"/><color rgb="FF213547"/></font><font><b/><sz val="16"/><name val="Aptos Display"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="10"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font><font><i/><sz val="9"/><name val="Aptos"/><color rgb="FF526779"/></font></fonts><fills count="11"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${["14344A", "EAF4F6", "DCEBD9", "DCE9F6", "F5E8CE", "ECE5F5", "F2E7E9", "FFFFFF", "F4F8FA"].map((c) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`).join("")}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD4E0E7"/></left><right style="thin"><color rgb="FFD4E0E7"/></right><top style="thin"><color rgb="FFD4E0E7"/></top><bottom style="thin"><color rgb="FFD4E0E7"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="16"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>${[3, 4, 5, 6, 7, 8].map((fill) => `<xf numFmtId="0" fontId="0" fillId="${fill}" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`).join("")}<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="9" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="10" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0"/><xf numFmtId="0" fontId="0" fillId="8" borderId="1" xfId="0"/><xf numFmtId="164" fontId="0" fillId="9" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function dailyWorkbook(sheets: DailySheet[], date: string): Blob {
  const names = sheets.map((s) => sheetName(s.area));
  return zipFiles(buildWorkbookFiles(names, STYLES, sheets.map((s) => sheetXml(s, date))));
}

export function dailyPdfHtml(sheets: DailySheet[], date: string): string {
  const dateText = displayDate(date);
  type Sec = [string, (s: DailySheet) => number[]];
  const sections: Sec[] = [
    ["Thông tin chung & dòng điện", (s) => [0, 1, 2, 3, 4, 5, 6, 7, 8, ...Array.from({ length: 4 }, (_, i) => s.labels.length + 6 + s.extras.length + i)]],
    ["Động cơ · gối KT / CT", () => [0, 2, 3, ...Array.from({ length: 10 }, (_, i) => i + 9)]],
    ["Quạt / bơm · gối KT / CT", () => [0, 2, 3, ...Array.from({ length: 10 }, (_, i) => i + 19)]],
  ];
  let pages = "";
  for (const sheet of sheets) {
    const heads = columns(sheet.labels, sheet.extras);
    const group: Sec[] = sheet.columnIndices ? [[sheet.title || sheet.area, () => sheet.columnIndices as number[]]] : [...sections];
    if (sheet.extras.length) {
      group.push(["Điểm đo bổ sung", (s) => [0, 2, 3, ...s.extras.map((_, i) => i + 6 + s.labels.length), heads.length - 4, heads.length - 3, heads.length - 2, heads.length - 1]]);
    }
    for (const [section, indicesFn] of group) {
      const indices = indicesFn(sheet).filter((i) => i < heads.length);
      const body = sheet.rows
        .map((item, i) => {
          const vals = rowValues(item, sheet.labels, sheet.extras, i, date);
          return `<tr>${indices.map((j) => `<td class="${j === 3 ? "device" : ""}">${htmlEsc(j === 1 ? displayDate(String(vals[j])) : vals[j])}</td>`).join("")}</tr>`;
        })
        .join("");
      pages += `<section class="page"><header><div class="eyebrow">PHÂN XƯỞNG VẬN HÀNH 1 · NĐDH</div><h1>BẢNG THEO DÕI THIẾT BỊ QUAY</h1><div class="meta"><strong>${htmlEsc(sheet.area)}</strong><span>Ngày đo ${dateText}</span><span>${sheet.rows.length} thiết bị</span></div></header><h2>${htmlEsc(section)}</h2><table><thead><tr>${indices.map((j) => `<th>${htmlEsc(heads[j])}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table><footer>Ô trống: chưa đo · 0: giá trị đo bằng 0 · Bản nháp chưa được lưu lên máy chủ</footer></section>`;
    }
  }
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Bảng đo ${dateText}</title><style>@page{size:A3 landscape;margin:12mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#173047;margin:0}.page{break-after:page;page-break-after:always}.page:last-child{break-after:auto}header{padding:0 0 12px;border-bottom:3px solid #156b78}.eyebrow{color:#156b78;font-size:10px;font-weight:700;letter-spacing:2px}h1{font-size:22px;margin:5px 0 8px}.meta{display:flex;gap:22px;align-items:center}.meta strong{font-size:15px;color:#123b55}h2{font-size:13px;color:#123b55;margin:15px 0 8px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #ccd9df;padding:5px 4px;overflow-wrap:anywhere;vertical-align:middle;text-align:center}th{background:#dcecf0;color:#123b55;font-size:9px;line-height:1.25}td.device{text-align:left;font-weight:bold}tr:nth-child(even) td{background:#f3f8fa}footer{margin-top:10px;color:#526779;font-size:9px}@media screen{body{background:#dce4e8;padding:20px}.page{background:#fff;padding:18px;margin:0 auto 20px;max-width:1500px;box-shadow:0 6px 25px #9caeb8}}@media print{button{display:none}}</style></head><body>${pages}</body></html>`;
}

// ---- Dựng dòng từ thiết bị + số đo ----

const numCell = (n: number | null | undefined) => (typeof n === "number" ? n : "");

/** Dòng xuất cho 1 thiết bị: `values` 23 ô số (null = chưa đo). Trạng thái = mức cảnh báo theo ngưỡng của thiết bị. */
export function makeDailyRow(
  d: VibrationDeviceDto,
  v: { power?: number | string | null; time: string; note: string; values: (number | null)[]; person: string; origin: string }
): DailyRow {
  const row: DailyRow["row"] = { power: v.power ?? "", measureTime: v.time, note: v.note };
  v.values.forEach((n, i) => (row[`v${i}`] = numCell(n)));
  const st = statusFor(d.alertConfig, v.values);
  return { device: { system: d.system, name: d.name }, row, person: v.person, status: st === "empty" ? "" : STATUS_LABEL[st], origin: v.origin };
}

export const hasDailyEntry = (r: DailyRow) => Object.entries(r.row).some(([k, x]) => /^v\d+$/.test(k) && x !== "" && x != null) || String(r.row.note ?? "").trim() !== "";

export const DAILY_LABELS: string[] = [...VIB_LABELS];
