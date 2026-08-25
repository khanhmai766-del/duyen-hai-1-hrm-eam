"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const TABLE_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export function TablePageSizeSelector({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <label className={cn("flex items-center gap-2 whitespace-nowrap text-sm text-slate-600", className)}>
      Hiển thị
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-9 rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
        aria-label="Số dòng hiển thị trên mỗi trang"
      >
        {TABLE_PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
      </select>
      dòng
    </label>
  );
}

export function TablePaginationFooter({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="text-slate-600">
        Hiển thị <b className="text-slate-900">{from}–{to}</b> trong tổng số <b className="text-slate-900">{total}</b> bản ghi
      </div>
      <div className="flex items-center justify-end gap-2" aria-label="Phân trang">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="Trang trước"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="grid h-9 min-w-9 place-items-center rounded-lg bg-[#075b96] px-2 text-sm font-bold text-white shadow-sm" title={`Trang ${currentPage}/${totalPages}`}>
          {currentPage}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="Trang sau"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
