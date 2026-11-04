"use client";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
export function MonthField({value,className,...props}: Omit<React.ComponentProps<"input">,"type">) {
  const month=String(value ?? "");
  const display=/^\d{4}-\d{2}$/.test(month)?`Tháng ${Number(month.slice(5))}/${month.slice(0,4)}`:"Chọn tháng";
  return <span className={cn("relative inline-flex h-10 min-w-0 items-center justify-between gap-2 rounded-lg border bg-white px-3 text-sm focus-within:ring-2 focus-within:ring-blue-500",className)}>
    <span className="whitespace-nowrap" aria-hidden="true">{display}</span><CalendarDays className="size-4 shrink-0" aria-hidden="true"/>
    <input {...props} type="month" value={value} aria-label={props["aria-label"] ?? "Chọn tháng"} className="absolute inset-0 h-full w-full cursor-pointer text-base opacity-0"/>
  </span>;
}
