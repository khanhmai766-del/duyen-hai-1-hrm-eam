"use client";

import * as React from "react";
import { CalendarRange, ChevronDown, Download, FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ExportMenuProps {
  periodControl?: React.ReactNode;
  periodLabel?: string;
  periodDescription?: string;
  onExportExcel: () => void | Promise<void>;
  onExportPdf: () => void | Promise<void>;
  className?: string;
  disabled?: boolean;
}

type ExportFormat = "excel" | "pdf";

export function ExportMenu({
  periodControl,
  periodLabel = "Thời gian dữ liệu",
  periodDescription = "Chọn mốc thời gian áp dụng cho file xuất.",
  onExportExcel,
  onExportPdf,
  className,
  disabled = false,
}: ExportMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState<ExportFormat | null>(null);

  async function handleExport(format: ExportFormat) {
    setExporting(format);
    try {
      await (format === "excel" ? onExportExcel() : onExportPdf());
      setOpen(false);
    } finally {
      setExporting(null);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="soft"
          size="toolbar"
          className={cn("group min-w-[132px] justify-between", className)}
          disabled={disabled}
          aria-label="Mở lựa chọn xuất dữ liệu"
        >
          <span className="flex items-center gap-2">
            <Download className="h-4 w-4 text-sky-600" />
            Xuất dữ liệu
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border-slate-200/90 bg-white p-0 shadow-[0_22px_55px_rgba(15,23,42,0.18)] dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="border-b border-sky-100 bg-[linear-gradient(135deg,#f8fbff_0%,#edf7ff_58%,#f0fdfa_100%)] px-4 py-3.5 dark:border-slate-700 dark:bg-[linear-gradient(135deg,#172033_0%,#152943_100%)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">Xuất báo cáo</p>
          <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-slate-50">Thiết lập file dữ liệu</p>
        </div>

        <div className="space-y-4 p-4">
          {periodControl && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/70">
              <div className="mb-2.5 flex items-start gap-2.5">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                  <CalendarRange className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{periodLabel}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{periodDescription}</p>
                </div>
              </div>
              {periodControl}
            </div>
          )}

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Định dạng file</p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => void handleExport("excel")}
                disabled={exporting !== null}
                className="group/format flex min-h-16 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md disabled:pointer-events-none disabled:opacity-60 dark:border-emerald-500/25 dark:bg-emerald-500/10"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-emerald-600 shadow-sm dark:bg-slate-800 dark:text-emerald-400">
                  {exporting === "excel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                </span>
                <span>
                  <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">Excel</span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">Tệp .xlsx</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void handleExport("pdf")}
                disabled={exporting !== null}
                className="group/format flex min-h-16 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3 text-left transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50 hover:shadow-md disabled:pointer-events-none disabled:opacity-60 dark:border-amber-500/25 dark:bg-amber-500/10"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-amber-600 shadow-sm dark:bg-slate-800 dark:text-amber-400">
                  {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                </span>
                <span>
                  <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">PDF</span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">In hoặc lưu</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
