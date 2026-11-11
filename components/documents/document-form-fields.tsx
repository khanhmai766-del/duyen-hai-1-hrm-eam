"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Field = { label?: string; required?: boolean; value: string; onChange: (value: string) => void };

export function DocumentChoiceField({ label, required, value, onChange, options, placeholder }: Field & {
  options: string[]; placeholder: string;
}) {
  return <div className="grid min-w-0 gap-1.5">
    <Label>{label}{required ? " *" : ""}</Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{options.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}

export function DocumentDateField({ label, required, value, onChange, type }: Field & { type: "date" | "datetime-local" }) {
  return <div className="grid min-w-0 gap-1.5">
    <Label>{label}{required ? " *" : ""}</Label>
    <Input type={type} value={value} onChange={event => onChange(event.target.value)} className="w-full min-w-0" />
  </div>;
}

export function DocumentTagField({ label, required, value, onChange, options, compact = false, wrap = false }: Field & {
  options: Array<{ label: string; value: string }>; compact?: boolean; wrap?: boolean;
}) {
  return <div className="grid min-w-0 gap-1.5">
    <Label>{label}{required ? " *" : ""}</Label>
    <div className={cn("flex gap-2", wrap ? "flex-wrap" : "flex-nowrap")}>
      {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value}
        onClick={() => onChange(option.value)} className={cn(
          "inline-flex min-w-16 items-center justify-center rounded-lg border text-sm font-semibold transition-colors",
          compact ? "h-10 flex-1 px-3" : "h-9 px-4",
          value === option.value ? "border-navy bg-navy text-white shadow-sm" : "border-slate-200 bg-white text-muted-foreground hover:border-navy/40 hover:text-navy",
        )}>{option.label}</button>)}
    </div>
  </div>;
}
