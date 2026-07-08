"use client";

import * as XLSX from "xlsx";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { printHtmlReport } from "@/lib/print-report";

interface ExportButtonProps {
  rows: Record<string, unknown>[];
  filename?: string;
  title?: string;
  /** Gợi ý độ rộng cột PDF theo đơn vị ch (số ký tự). Cột không khai báo sẽ tự chia phần còn lại. */
  widths?: Record<string, number>;
}

const LABELS: Record<string, string> = {
  code: "Mã",
  name: "Tên",
  unit: "Tổ máy",
  system: "Hệ thống",
  managingPosition: "Cương vị",
  cuongVi: "Cương vị",
  note: "Ghi chú",
  stt: "STT",
  seq: "Số thứ tự",
  parentName: "Thuộc thư mục",
  drawing: "Bản vẽ liên quan",
  level: "Cấp",
  hasProfile: "Lý lịch",
  title: "Tiêu đề",
  classification: "Phân loại",
  orderAuthority: "Cấp lệnh",
  orderedBy: "Theo lệnh",
  quantity: "Số lượng",
  minStock: "Tồn tối thiểu",
  device: "Thiết bị",
  supplier: "Nhà cung cấp",
  requestType: "Yêu cầu",
  requestNumber: "Số yêu cầu",
  content: "Nội dung",
  severity: "Mức độ",
  status: "Tình trạng",
  detectedAt: "Ngày phát hiện",
  detectedBy: "Người nhập",
  workOrderNumber: "Số phiếu công tác",
  performedAt: "Ngày thực hiện",
  result: "Kết quả thực hiện",
  doneBy: "Người thực hiện",
  material: "Vật tư",
  target: "Áp dụng cho",
  dvt: "ĐVT",
  interval: "Chu kỳ",
  lastReplaced: "Lần thay gần nhất",
  nextDue: "Ngày đến hạn",
};

function cellText(value: unknown) {
  if (value == null || value === "") return "-";
  if (value instanceof Date) return value.toLocaleDateString("vi-VN");
  return String(value).replace(/\s+/g, " ").trim();
}

function reportTitle(filename: string, title?: string) {
  return (title || filename.replace(/[-_]+/g, " ")).toUpperCase();
}

function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function keysOf(rows: Record<string, unknown>[]) {
  return rows.length ? Object.keys(rows[0]) : [];
}

function labelFor(key: string) {
  return LABELS[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (m) => m.toUpperCase());
}

function columnWidths(rows: Record<string, unknown>[], keys: string[]) {
  return keys.map((key) => {
    const max = Math.max(labelFor(key).length, ...rows.slice(0, 80).map((row) => cellText(row[key]).length));
    return { wch: Math.min(Math.max(max + 3, 12), 34) };
  });
}

function escapeHtml(value: unknown) {
  return cellText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function ExportButton({ rows, filename = "bao-cao", title, widths }: ExportButtonProps) {
  function assertRows() {
    if (!rows.length) {
      toast.error("Không có dữ liệu để xuất");
      return false;
    }
    return true;
  }

  function exportExcel() {
    if (!assertRows()) return;
    const keys = keysOf(rows);
    const heading = reportTitle(filename, title);
    const aoa = [
      [heading],
      [`Ngày xuất: ${formatDate()}`, `Số bản ghi: ${rows.length}`],
      [],
      keys.map(labelFor),
      ...rows.map((row) => keys.map((key) => cellText(row[key]))),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    sheet["!cols"] = columnWidths(rows, keys);
    sheet["!rows"] = [{ hpt: 24 }, { hpt: 20 }, { hpt: 8 }, { hpt: 28 }, ...rows.map(() => ({ hpt: 25 }))];
    sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, keys.length - 1) } }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Bao cao");
    XLSX.writeFile(workbook, `${filename}.xlsx`, { compression: true });
    toast.success("Đã xuất Excel");
  }

  function exportPdf() {
    if (!assertRows()) return;
    const keys = keysOf(rows);
    const heading = reportTitle(filename, title);
    const colgroup = keys
      .map((key) => (widths?.[key] ? `<col style="width:${widths[key]}ch" />` : "<col />"))
      .join("");
    const head = keys.map((key) => `<th>${escapeHtml(labelFor(key))}</th>`).join("");
    const body = rows
      .map((row) => `<tr>${keys.map((key) => `<td>${escapeHtml(row[key])}</td>`).join("")}</tr>`)
      .join("");
    const report = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(heading)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: "Times New Roman", Arial, sans-serif; font-size: 11px; }
    h1 { margin: 0 0 4px; text-align: center; font-size: 18px; text-transform: uppercase; }
    .meta { display: flex; justify-content: space-between; margin: 0 0 12px; font-weight: 600; color: #374151; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #9ca3af; padding: 6px 7px; line-height: 1.25; vertical-align: middle; word-break: break-word; }
    th { background: #e5edf8; text-align: center; text-transform: uppercase; font-size: 10px; font-weight: 700; }
    tr { page-break-inside: avoid; }
  </style>
</head>
<body>
  <h1>${escapeHtml(heading)}</h1>
  <div class="meta"><span>Ngày xuất: ${formatDate()}</span><span>Số bản ghi: ${rows.length}</span></div>
  <table><colgroup>${colgroup}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body>
</html>`;
    if (!printHtmlReport(report)) {
      toast.error("Không mở được trình in PDF");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-xl border-sky-200/80 bg-[linear-gradient(135deg,#ffffff_0%,#eef7ff_100%)] px-3 font-semibold text-navy shadow-[0_8px_18px_rgba(30,64,175,0.12)] hover:border-sky-300 hover:text-accent"
        >
          <Download className="h-4 w-4" /> Xuất
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem onClick={exportExcel} className="gap-2">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportPdf} className="gap-2">
          <Printer className="h-4 w-4 text-amber-600" /> PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
