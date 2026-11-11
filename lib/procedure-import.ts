import * as XLSX from "xlsx";
import type { DigitalDocumentInput } from "@/hooks/useDocuments";
import { normalizeText } from "@/lib/nav";
import { normalizeExternalDocumentUrl } from "@/lib/google-drive-document";
import { COMMON_BLOCK, LEGACY_COMMON_POSITION, normalizeManagementBlock, normalizeProcedureType } from "@/lib/document-catalog";

type ProcedureImportRow = {
  title: string;
  managingPosition: string;
  managementBlock: string;
  procedureType: string;
  decisionNumber: string;
  issueDate: string;
  documentUrl: string;
};

function parseProcedureImportRows(rows: Array<Array<string | number | Date | null>>, sheet: XLSX.WorkSheet) {
  const errors: string[] = [];
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeText(cellString(cell)) === "ten quy trinh"));
  if (headerIndex < 0) return { items: [] as ProcedureImportRow[], errors: ["File Excel thiếu dòng tiêu đề mẫu"] };

  const headers = rows[headerIndex].map((cell) => normalizeText(cellString(cell)));
  const sttIndex = findColumnIndex(headers, ["stt"]);
  const titleIndex = findColumnIndex(headers, ["ten quy trinh"]);
  const procedureTypeIndex = findColumnIndex(headers, ["loai qt", "loai quy trinh"]);
  const positionIndex = findColumnIndex(headers, ["cuong vi"]);
  const managementBlockIndex = findColumnIndex(headers, ["khoi quan ly"]);
  const decisionIndex = findColumnIndex(headers, ["so quyet dinh"]);
  const issueDateIndex = findColumnIndex(headers, ["ngay ban hanh"]);
  const linkIndex = findColumnIndex(headers, ["link tai lieu", "duong dan tai lieu", "tai lieu"]);

  if (sttIndex < 0 || titleIndex < 0 || procedureTypeIndex < 0 || positionIndex < 0 || decisionIndex < 0 || issueDateIndex < 0 || linkIndex < 0) {
    return {
      items: [] as ProcedureImportRow[],
      errors: ["File Excel phải có đủ cột: STT, Tên quy trình, Loại QT, Cương vị, Số quyết định, Ngày ban hành, Link tài liệu"],
    };
  }

  const items: ProcedureImportRow[] = [];
  rows.slice(headerIndex + 1).forEach((row, index) => {
    const line = headerIndex + index + 2;
    const sheetRowIndex = headerIndex + index + 1;
    const title = cellString(row[titleIndex]);
    const documentUrl = cellLink(sheet, sheetRowIndex, linkIndex) || cellString(row[linkIndex]) || cellLink(sheet, sheetRowIndex, titleIndex);
    const rawIssueDate = row[issueDateIndex];
    const issueDate = cellDate(rawIssueDate);
    const hasContent = row.some((cell) => cellString(cell));
    if (!hasContent) return;

    if (!title) {
      errors.push(`Dòng ${line}: thiếu tên quy trình`);
      return;
    }
    if (!documentUrl) {
      errors.push(`Dòng ${line}: thiếu link tài liệu`);
      return;
    }
    if (!normalizeExternalDocumentUrl(documentUrl)) {
      errors.push(`Dòng ${line}: link tài liệu không hợp lệ (phải bắt đầu bằng http:// hoặc https://)`);
      return;
    }
    if (cellString(rawIssueDate) && !issueDate) {
      errors.push(`Dòng ${line}: ngày ban hành không hợp lệ`);
      return;
    }

    items.push({
      title,
      managingPosition: cellString(row[positionIndex]),
      managementBlock: normalizeManagementBlock(managementBlockIndex >= 0 ? cellString(row[managementBlockIndex]) : ""),
      procedureType: normalizeProcedureType(cellString(row[procedureTypeIndex])),
      decisionNumber: cellString(row[decisionIndex]),
      issueDate,
      documentUrl,
    });
  });

  return { items, errors };
}

function findColumnIndex(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(header));
}

function cellString(value: string | number | Date | null | undefined) {
  if (value == null) return "";
  if (value instanceof Date) return formatInputDate(value);
  return String(value).trim();
}

function cellLink(sheet: XLSX.WorkSheet, rowIndex: number, columnIndex: number) {
  if (columnIndex < 0) return "";
  const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })] as (XLSX.CellObject & { l?: { Target?: string } }) | undefined;
  const target = cell?.l?.Target?.trim();
  if (target) return target;
  const formulaLink = formulaHyperlink(cell?.f);
  return formulaLink;
}

function formulaHyperlink(formula?: string) {
  const raw = String(formula ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/^HYPERLINK\(\s*"([^"]+)"/i) ?? raw.match(/^HYPERLINK\(\s*'([^']+)'/i);
  return match?.[1]?.trim() ?? "";
}

function cellDate(value: string | number | Date | null | undefined) {
  if (value == null || value === "") return "";
  if (value instanceof Date) return formatInputDate(value);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }

  const raw = value.trim();
  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;

  const viMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (viMatch) return `${viMatch[3]}-${viMatch[2].padStart(2, "0")}-${viMatch[1].padStart(2, "0")}`;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : formatInputDate(date);
}

function importProcedurePositions(value: string, positionOptions: string[]) {
  const raw = value.trim();
  if (!raw) return positionOptions;
  if (normalizeText(raw) === normalizeText(COMMON_BLOCK) || normalizeText(raw) === normalizeText(LEGACY_COMMON_POSITION) || normalizeText(raw) === "tat ca cuong vi") {
    return positionOptions;
  }
  const requested = raw
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return requested.length ? requested : positionOptions;
}

function formatInputDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function downloadProcedureImportTemplate() {
    const columns = ["STT", "Tên quy trình", "Loại QT", "Cương vị", "Khối quản lý", "Số quyết định", "Ngày ban hành", "Link tài liệu"];
    const sheet = XLSX.utils.aoa_to_sheet([
      columns,
      [1, "Quy trình vận hành mẫu", "QTVH-XLSC", "Lò trưởng S1, Máy trưởng S1", "Chung", "QD-001/2026", "2026-06-29", "https://..."],
    ]);
    sheet["!cols"] = [
      { wch: 8 },
      { wch: 36 },
      { wch: 24 },
      { wch: 34 },
      { wch: 18 },
      { wch: 22 },
      { wch: 16 },
      { wch: 42 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Mau nhap quy trinh");
    XLSX.writeFile(workbook, "mau-nhap-quy-trinh-van-hanh.xlsx", { compression: true });
  }

export function readProcedureImport(data: ArrayBuffer, positions: string[]): DigitalDocumentInput[] {
  const workbook = XLSX.read(data, { type: "array", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("File Excel không có dữ liệu");
  const parsed = parseProcedureImportRows(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }), sheet);
  if (parsed.errors.length) throw new Error(parsed.errors[0]);
  if (!parsed.items.length) throw new Error("File Excel chưa có dòng quy trình hợp lệ");
  if (parsed.items.length > 500) throw new Error("Mỗi lần chỉ nhập tối đa 500 quy trình");
  return parsed.items.map(item => ({ ...item, category: "PROCEDURE", managingPosition: JSON.stringify(importProcedurePositions(item.managingPosition, positions)) }));
}
