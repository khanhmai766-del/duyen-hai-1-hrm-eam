"use client";

import * as React from "react";
import { Search, X, ChevronDown, Check, Unplug, ArrowUp, Repeat2, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Thanh lọc + tìm kiếm của trang Khiếm khuyết, gom vào MỘT khối: ô tìm kiếm chiếm phần
 * rộng, tổ máy dạng nút gạt (dùng liên tục nên để lộ sẵn), các bộ lọc còn lại thu vào
 * dropdown, và hàng chip "Đang lọc" cho biết đang lọc theo gì + số bản ghi.
 *
 * THUẦN GIAO DIỆN: mỗi bộ lọc vẫn là MỘT giá trị đúng như API đang nhận
 * (unit/requestType/position/severity/status) — không đổi hook, không đổi back-end.
 */

export type FilterOption = { value: string; label: string };

export type ActiveChip = {
  key: string;
  label: string; // nhãn nhóm, vd "Tổ máy"
  value: string; // giá trị hiển thị, vd "S1"
  onClear?: () => void; // không có = chip ngữ cảnh, không gỡ được (đang ở giá trị mặc định)
};

export function DefectFilterBar({
  search,
  onSearchChange,
  units,
  unit,
  onUnitChange,
  dropdowns,
  chips,
  total,
  scopeTotal,
  mismatchOnly,
  onMismatchOnlyChange,
  upgradeCandidatesOnly,
  onUpgradeCandidatesOnlyChange,
  upgradeCandidateTotal,
  showUpgradeCandidates,
  repeatedRepairOnly,
  onRepeatedRepairOnlyChange,
  repeatedRepairTotal,
  canReset,
  onReset,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  units: readonly string[];
  unit: string;
  onUnitChange: (value: string) => void;
  dropdowns: Array<{
    label: string;
    value: string;
    options: FilterOption[];
    /** Nhãn của mục "bỏ lọc"; bỏ trống nghĩa là bộ lọc luôn phải có 1 giá trị. */
    allLabel?: string;
    allValue?: string;
    onChange: (value: string) => void;
  }>;
  chips: ActiveChip[];
  total: number;
  scopeTotal: number;
  mismatchOnly: boolean;
  onMismatchOnlyChange: (value: boolean) => void;
  upgradeCandidatesOnly: boolean;
  onUpgradeCandidatesOnlyChange: (value: boolean) => void;
  upgradeCandidateTotal: number;
  showUpgradeCandidates: boolean;
  repeatedRepairOnly: boolean;
  onRepeatedRepairOnlyChange: (value: boolean) => void;
  repeatedRepairTotal: number;
  canReset: boolean;
  onReset: () => void;
}) {
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);
  const advancedFilterCount = dropdowns.filter(
    (dropdown) => dropdown.allValue !== undefined && dropdown.value !== dropdown.allValue
  ).length;

  // Ctrl/⌘ + K nhảy vào ô tìm kiếm — thao tác lặp nhiều nhất trên trang này.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="rounded-xl border border-border bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") event.currentTarget.blur();
            }}
            placeholder="Tìm số yêu cầu, nội dung, mã thiết bị (KKS)…"
            className="h-10 bg-muted/30 pl-9 pr-20"
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 gap-1 sm:flex">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
        </div>

        <span className="hidden h-7 w-px shrink-0 bg-border lg:block" />

        {/* Tổ máy: bấm nhiều nhất nên để lộ sẵn thay vì giấu trong dropdown.
            Không cần nhãn — S1 / S2 / Common đã tự nói rõ đây là tổ máy. */}
        <div className="flex w-full items-center gap-2 sm:contents">
          <div className="flex h-10 min-w-0 flex-1 items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-1 sm:flex-none">
            {units.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onUnitChange(value)}
                className={cn(
                  "h-8 min-w-0 flex-1 rounded-md px-2 text-sm font-semibold transition-colors sm:flex-none sm:px-3.5",
                  unit === value ? "bg-navy text-white shadow-sm" : "text-muted-foreground hover:text-ink"
                )}
              >
                {value === "ALL" ? "Tất cả" : value === "COMMON" ? "Common" : value}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setMobileFiltersOpen((open) => !open)}
            aria-expanded={mobileFiltersOpen}
            aria-controls="defect-mobile-advanced-filters"
            className={cn(
              "flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-bold transition-colors sm:hidden",
              mobileFiltersOpen || advancedFilterCount > 0
                ? "border-blue-200 bg-blue-50 text-accent"
                : "border-border bg-white text-muted-foreground"
            )}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Lọc
            {advancedFilterCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                {advancedFilterCount}
              </span>
            )}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", mobileFiltersOpen && "rotate-180")} aria-hidden="true" />
          </button>
        </div>

        <div className="hidden sm:contents">
          {dropdowns.map((dd) => (
            <FilterDropdown key={dd.label} {...dd} />
          ))}
        </div>

        {mobileFiltersOpen && (
          <div
            id="defect-mobile-advanced-filters"
            className="grid w-full grid-cols-2 gap-2 rounded-xl border border-sky-100 bg-slate-50/70 p-2.5 sm:hidden"
          >
            {dropdowns.map((dd, index) => (
              <div key={dd.label} className={cn(index === dropdowns.length - 1 && dropdowns.length % 2 === 1 && "col-span-2")}>
                <FilterDropdown {...dd} triggerClassName="w-full justify-between" />
              </div>
            ))}
          </div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-border px-3 py-2.5">
          <div className="flex w-full min-w-0 items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-auto sm:flex-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Đang lọc</span>
            {chips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 pl-2.5 pr-1.5 text-[12.5px] font-semibold text-accent"
              >
                <span className="font-semibold text-accent/60">{chip.label}:</span>
                {chip.value}
                {chip.onClear && (
                  <button
                    type="button"
                    onClick={chip.onClear}
                    aria-label={`Bỏ lọc ${chip.label}`}
                    className="flex h-[18px] w-[18px] items-center justify-center rounded text-accent/60 transition-colors hover:bg-blue-100 hover:text-accent"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
          <div className="flex w-full items-center justify-between gap-3 sm:ml-auto sm:w-auto sm:flex-wrap sm:justify-end">
            <div className="flex shrink-0 items-center gap-2">
              {showUpgradeCandidates && (
                <button
                  type="button"
                  aria-pressed={upgradeCandidatesOnly}
                  aria-label="Chỉ hiển thị phiếu cần xem xét nâng lên Mức 2"
                  title="Phiếu Mức 3/4 đã qua tối thiểu 7 ngày kể từ lần nhắc thứ hai"
                  onClick={() => onUpgradeCandidatesOnlyChange(!upgradeCandidatesOnly)}
                  className={cn(
                    "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:ring-offset-2",
                    upgradeCandidatesOnly
                      ? "border-amber-300 bg-amber-100 text-amber-800 shadow-sm"
                      : "border-border bg-white text-muted-foreground hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
                  )}
                >
                  <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                  <span className="hidden sm:inline">Cần nâng M2</span>
                  <span className={cn(
                    "rounded-full px-1.5 tabular-nums",
                    upgradeCandidatesOnly ? "bg-amber-200/70" : "bg-muted"
                  )}>
                    {upgradeCandidateTotal}
                  </span>
                  {upgradeCandidatesOnly && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
                </button>
              )}
              <button
                type="button"
                aria-pressed={repeatedRepairOnly}
                aria-label="Chỉ hiển thị phiếu có nội dung sửa chữa lặp lại"
                title="Chỉ hiển thị phiếu có ghi nội dung sửa chữa lặp lại"
                onClick={() => onRepeatedRepairOnlyChange(!repeatedRepairOnly)}
                className={cn(
                  "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-2",
                  repeatedRepairOnly
                    ? "border-violet-300 bg-violet-100 text-violet-800 shadow-sm"
                    : "border-border bg-white text-muted-foreground hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
                )}
              >
                <Repeat2 className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                <span className="hidden sm:inline">Sửa chữa lặp lại</span>
                <span className={cn(
                  "rounded-full px-1.5 tabular-nums",
                  repeatedRepairOnly ? "bg-violet-200/70" : "bg-muted"
                )}>
                  {repeatedRepairTotal}
                </span>
                {repeatedRepairOnly && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
              </button>
              <button
                type="button"
                aria-pressed={mismatchOnly}
                aria-label="Chỉ hiển thị kết quả chưa khớp giữa vận hành và sửa chữa"
                title="Chỉ hiển thị kết quả chưa khớp giữa vận hành và sửa chữa"
                onClick={() => onMismatchOnlyChange(!mismatchOnly)}
                className={cn(
                  "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-2",
                  mismatchOnly
                    ? "border-red-200 bg-red-50 text-red-700 shadow-sm"
                    : "border-border bg-white text-muted-foreground hover:border-red-200 hover:bg-red-50/60 hover:text-red-700"
                )}
              >
                <Unplug className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Chưa khớp</span>
                {mismatchOnly && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
              </button>
            </div>
            <span className="text-[13px] text-muted-foreground">
              <b className="tabular-nums text-ink">{total.toLocaleString("vi-VN")}</b>
              {" / "}
              {scopeTotal.toLocaleString("vi-VN")} bản ghi
            </span>
            {canReset && (
              <button
                type="button"
                onClick={onReset}
                className="text-[13px] font-semibold text-destructive hover:underline"
              >
                Xóa lọc
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-b-2 border-border bg-white px-1.5 py-px text-[10.5px] font-semibold text-muted-foreground">
      {children}
    </span>
  );
}

function FilterDropdown({
  label,
  value,
  options,
  allLabel,
  allValue,
  onChange,
  triggerClassName,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  allLabel?: string;
  allValue?: string;
  onChange: (value: string) => void;
  triggerClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const active = allValue === undefined ? true : value !== allValue;
  const current = options.find((option) => option.value === value);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors",
            active
              ? "border-blue-200 bg-blue-50 text-accent"
              : "border-border bg-white text-muted-foreground hover:text-ink",
            open && "ring-2 ring-accent/15",
            triggerClassName
          )}
        >
          {label}
          {active && current && (
            <span className="max-w-[112px] truncate rounded-md bg-accent px-1.5 text-xs font-bold text-white">
              {current.label}
            </span>
          )}
          <ChevronDown className={cn("h-3.5 w-3.5 opacity-60 transition-transform", open && "rotate-180")} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[320px] w-[248px] overflow-y-auto p-1.5">
        <div className="px-2 py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {allValue !== undefined && (
          <OptionRow
            selected={value === allValue}
            label={allLabel ?? "Tất cả"}
            onSelect={() => {
              onChange(allValue);
              setOpen(false);
            }}
          />
        )}
        {options.map((option) => (
          <OptionRow
            key={option.value}
            selected={value === option.value}
            label={option.label}
            onSelect={() => {
              onChange(option.value);
              setOpen(false);
            }}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OptionRow({
  selected,
  label,
  onSelect,
}: {
  selected: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13.5px] transition-colors hover:bg-muted/60"
    >
      <span
        className={cn(
          "flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded border-[1.5px] transition-colors",
          selected ? "border-accent bg-accent text-white" : "border-border"
        )}
      >
        {selected && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
      </span>
      <span className={cn("min-w-0 flex-1 truncate", selected && "font-semibold")}>{label}</span>
    </button>
  );
}
