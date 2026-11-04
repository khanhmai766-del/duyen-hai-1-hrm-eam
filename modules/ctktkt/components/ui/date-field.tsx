"use client";
import { cn } from "@/lib/utils";
import { CalendarDays } from "lucide-react";
export type DateFieldProps = { value: string; onChange: (value: string) => void; min?: string; max?: string; className?: string; placeholder?: string; disabled?: boolean };
export function DateField({ value, onChange, min, max, className, placeholder = "Chọn ngày", disabled }: DateFieldProps) {
  const display = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join("/") : placeholder;
  return <span className={cn("qlkt-date-field relative inline-flex h-10 min-w-0 items-center justify-between gap-1 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 focus-within:ring-2 focus-within:ring-blue-500", disabled && "opacity-50", className)}>
    <span className="whitespace-nowrap" aria-hidden="true">{display}</span><CalendarDays className="size-4 shrink-0" aria-hidden="true" />
    <input type="date" lang="vi" aria-label={placeholder === "dd/mm/yyyy" ? "Chọn ngày" : placeholder} value={value} min={min} max={max} disabled={disabled} onChange={event => { if(event.target.value) onChange(event.target.value); }} className="absolute inset-0 h-full w-full cursor-pointer text-base opacity-0" />
  </span>;
}
