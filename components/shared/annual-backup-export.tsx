"use client";

import * as React from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExportMenu } from "@/components/shared/export-menu";
import { printHtmlReport } from "@/lib/print-report";

export interface BackupColumn<T> {
  key: string;
  header: string;
  width?: number;
  align?: "left" | "center" | "right";
  value: (row: T, index: number) => string | number | null | undefined;
}

interface AnnualBackupExportProps<T> {
  rows: T[];
  columns: BackupColumn<T>[];
  dateAccessor: (row: T) => Date | string | null | undefined;
  yearAccessor?: (row: T) => Date | string | number | null | undefined;
  yearOptions?: Array<string | number>;
  title: string;
  subtitle?: string;
  filenamePrefix: string;
  className?: string;
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cellText(value: string | number | null | undefined) {
  return value == null || value === "" ? "-" : String(value).replace(/\s+/g, " ").trim();
}

function toYear(value: Date | string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}$/.test(trimmed)) return Number(trimmed);
    return toDate(trimmed)?.getFullYear() ?? null;
  }
  if (value instanceof Date || value == null) {
    return toDate(value)?.getFullYear() ?? null;
  }
  return null;
}

function escapeHtml(value: string | number | null | undefined) {
  return cellText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatReportDate(date = new Date()) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function AnnualBackupExport<T>({
  rows,
  columns,
  dateAccessor,
  yearAccessor,
  yearOptions = [],
  title,
  subtitle,
  filenamePrefix,
  className,
}: AnnualBackupExportProps<T>) {
  const years = React.useMemo(() => {
    const values = [
      ...yearOptions.map(toYear),
      ...rows.map((row) => toYear(yearAccessor ? yearAccessor(row) : dateAccessor(row))),
    ]
      .filter((year): year is number => typeof year === "number")
      .sort((a, b) => b - a);
    return Array.from(new Set(values));
  }, [rows, dateAccessor, yearAccessor, yearOptions]);
  const [year, setYear] = React.useState(() => years[0] ?? new Date().getFullYear());

  React.useEffect(() => {
    if (years.length && !years.includes(year)) setYear(years[0]);
  }, [year, years]);

  const annualRows = React.useMemo(
    () => rows.filter((row) => toYear(yearAccessor ? yearAccessor(row) : dateAccessor(row)) === year),
    [rows, dateAccessor, yearAccessor, year]
  );

  function assertRows() {
    if (!annualRows.length) {
      toast.error(`Không có dữ liệu năm ${year} để xuất báo cáo`);
      return false;
    }
    return true;
  }

  function exportExcel() {
    if (!assertRows()) return;
    const metaRows = [
      [title],
      [subtitle || "Báo cáo dữ liệu backup định kỳ hằng năm"],
      [`Năm báo cáo: ${year}`, `Ngày xuất: ${formatReportDate()}`, `Số bản ghi: ${annualRows.length}`],
      [],
    ];
    const tableRows = annualRows.map((row, index) => columns.map((c) => cellText(c.value(row, index))));
    const sheet = XLSX.utils.aoa_to_sheet([...metaRows, columns.map((c) => c.header), ...tableRows]);
    sheet["!cols"] = columns.map((c) => ({ wch: c.width ?? 18 }));
    sheet["!rows"] = [
      { hpt: 24 },
      { hpt: 20 },
      { hpt: 20 },
      { hpt: 8 },
      { hpt: 30 },
      ...tableRows.map(() => ({ hpt: 28 })),
    ];
    sheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, columns.length - 1) } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(0, columns.length - 1) } },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Bao cao nam");
    XLSX.writeFile(workbook, `${filenamePrefix}-${year}.xlsx`, { compression: true });
    toast.success(`Đã xuất Excel năm ${year}`);
  }

  function exportPdf() {
    if (!assertRows()) return;
    const colgroup = columns.map((c) => `<col style="width:${c.width ?? 18}ch" />`).join("");
    const head = columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join("");
    const body = annualRows
      .map(
        (row, index) =>
          `<tr>${columns
            .map((c) => `<td class="${c.align ?? "left"}">${escapeHtml(c.value(row, index))}</td>`)
            .join("")}</tr>`
      )
      .join("");
    const doc = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} ${year}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: "Times New Roman", Arial, sans-serif; font-size: 11px; }
    .report-title { text-align: center; font-size: 18px; font-weight: 700; text-transform: uppercase; margin: 0 0 4px; }
    .subtitle { text-align: center; color: #4b5563; margin: 0 0 10px; }
    .meta { display: flex; justify-content: space-between; margin: 0 0 10px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #9ca3af; padding: 6px 7px; vertical-align: middle; line-height: 1.25; }
    th { background: #e5edf8; text-align: center; text-transform: uppercase; font-size: 10px; font-weight: 700; }
    td { word-break: break-word; min-height: 24px; }
    tr { page-break-inside: avoid; }
    .center { text-align: center; }
    .right { text-align: right; }
    .left { text-align: left; }
  </style>
</head>
<body>
  <h1 class="report-title">${escapeHtml(title)}</h1>
  <p class="subtitle">${escapeHtml(subtitle || "Báo cáo dữ liệu backup định kỳ hằng năm")}</p>
  <div class="meta">
    <span>Năm báo cáo: ${year}</span>
    <span>Số bản ghi: ${annualRows.length}</span>
    <span>Ngày xuất: ${formatReportDate()}</span>
  </div>
  <table>
    <colgroup>${colgroup}</colgroup>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`;
    if (!printHtmlReport(doc)) {
      toast.error("Không mở được trình in PDF");
    }
  }

  return (
    <ExportMenu
      className={className}
      periodLabel="Năm báo cáo"
      periodDescription="Dữ liệu trong file được lọc theo năm đã chọn."
      periodControl={
        <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
          <SelectTrigger className="h-10 w-full rounded-xl bg-white" aria-label="Chọn năm báo cáo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(years.length ? years : [year]).map((item) => (
              <SelectItem key={item} value={String(item)}>
                Năm {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      onExportExcel={exportExcel}
      onExportPdf={exportPdf}
    />
  );
}
