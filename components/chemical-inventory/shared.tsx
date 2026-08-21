"use client";

import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { UNIT_LABELS, WARNING_LABELS, type BaseUnit, type WarningCode } from "@/lib/chemical-inventory/constants";

/**
 * Tiện ích hiển thị dùng chung cho các tab của Tồn kho hóa chất.
 *
 * Hai quy tắc xuyên suốt màn hình này:
 *  - `null` là CHƯA CÓ SỐ, hiện dấu "—", không bao giờ hiện 0.
 *  - kg, tấn và lít không bao giờ cộng chung; đơn vị luôn đi kèm con số.
 */

/** Định dạng số theo vi-VN, giữ tối đa 3 số lẻ để không làm tròn mất dữ liệu gốc. */
export function fmt(value: number | null | undefined, maxDigits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("vi-VN", { maximumFractionDigits: maxDigits });
}

/** Số kèm đơn vị, ví dụ "165.158 kg". */
export function fmtUnit(value: number | null | undefined, unit: BaseUnit, maxDigits = 3): string {
  if (value === null || value === undefined) return "—";
  return `${fmt(value, maxDigits)} ${UNIT_LABELS[unit]}`;
}

export function unitLabel(unit: BaseUnit) {
  return UNIT_LABELS[unit];
}

/** "2026-07" → "07/2026" */
export function periodLabel(periodKey: string) {
  const [year, month] = periodKey.split("-");
  return `${month}/${year}`;
}

/** "2026-07-15" → "15/07" */
export function shortDate(iso: string) {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

export function warningLabel(code: string) {
  return WARNING_LABELS[code as WarningCode] ?? code;
}

/**
 * Cảnh báo hiện bằng CHỮ kèm biểu tượng, không chỉ bằng màu — người không phân
 * biệt được màu vẫn phải đọc được nội dung cảnh báo.
 */
export function WarningChip({ codes, className }: { codes: string[]; className?: string }) {
  if (codes.length === 0) return null;
  const label = codes.map(warningLabel).join(" · ");
  return (
    <span
      className={cn(
        "inline-flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[12px] font-medium leading-5 text-amber-900",
        className
      )}
      title={label}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

/** Nhãn nhỏ ghi chú một ô dẫn xuất — dùng để nói rõ con số từ đâu ra. */
export function DerivedHint({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <Info className="h-3 w-3 shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Trạng thái kỳ: đang nhập liệu hay đã khóa sổ. */
export function PeriodStatusBadge({ status }: { status: string }) {
  const locked = status === "LOCKED";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-semibold uppercase tracking-wide",
        locked ? "bg-emerald-600 text-white" : "border border-amber-300 bg-amber-50 text-amber-900"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", locked ? "bg-white" : "bg-amber-500")} aria-hidden="true" />
      {locked ? "Đã khóa sổ" : "Đang nhập liệu"}
    </span>
  );
}

/** Ô số trong bảng: canh phải, chữ số đều nhau để cột thẳng hàng. */
export function NumCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{children}</span>;
}

/** Trạng thái lưu của một ô nhập liệu. */
export type SaveState = "idle" | "saving" | "saved" | "error";

export function SaveDot({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const map: Record<Exclude<SaveState, "idle">, { cls: string; label: string }> = {
    saving: { cls: "bg-sky-500 animate-pulse", label: "Đang lưu" },
    saved: { cls: "bg-emerald-500", label: "Đã lưu" },
    error: { cls: "bg-red-500", label: "Lỗi" },
  };
  const it = map[state];
  return <span className={cn("ml-1 inline-block h-1.5 w-1.5 rounded-full align-middle", it.cls)} title={it.label} />;
}

/** Danh sách 12 tháng của một năm, dùng cho bảng tổng hợp năm. */
export const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `Th ${i + 1}`);

/** Nhóm đơn vị để dựng KPI — mỗi nhóm một thẻ riêng, không gộp. */
export const UNIT_GROUPS: { unit: BaseUnit; label: string }[] = [
  { unit: "KG", label: "Hóa chất" },
  { unit: "TON", label: "Dầu HFO" },
  { unit: "LITER", label: "Diesel / DO" },
];
