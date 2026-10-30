"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

/**
 * Thay cho `<input type="datetime-local">`: ô đó hiện giờ theo ngôn ngữ trình duyệt (máy để tiếng Anh ra AM/PM),
 * nên tách thành ô ngày + chọn giờ 00–23 + phút. Giá trị vào/ra giữ nguyên dạng `YYYY-MM-DDTHH:mm` ("" khi trống).
 */
export function DateTime24Input({ value, onChange, className, required, disabled, min }: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  /** Cùng dạng `YYYY-MM-DDTHH:mm`; chỉ chặn phần ngày. */
  min?: string;
}) {
  const [date, setDate] = useState(value.slice(0, 10));
  const [hour, setHour] = useState(value.slice(11, 13) || "00");
  const [minute, setMinute] = useState(value.slice(14, 16) || "00");

  // Giá trị đổi từ ngoài (nạp phiếu, đặt lại form) → đồng bộ lại ngay trong lúc render.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDate(value.slice(0, 10));
    if (value) { setHour(value.slice(11, 13)); setMinute(value.slice(14, 16)); }
  }

  const emit = (d: string, h: string, m: string) => onChange(d ? `${d}T${h}:${m}` : "");
  const select = cn(className, "w-[4.25rem] shrink-0 px-2");

  return <div className="flex items-center gap-1.5">
    <input type="date" className={cn(className, "w-0 min-w-0 flex-1")} value={date} required={required} disabled={disabled} min={min?.slice(0, 10)}
      onChange={e => { setDate(e.target.value); emit(e.target.value, hour, minute); }} />
    <select aria-label="Giờ" className={select} value={hour} disabled={disabled} onChange={e => { setHour(e.target.value); emit(date, e.target.value, minute); }}>
      {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
    </select>
    <span className="text-slate-500">:</span>
    <select aria-label="Phút" className={select} value={minute} disabled={disabled} onChange={e => { setMinute(e.target.value); emit(date, hour, e.target.value); }}>
      {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
    </select>
  </div>;
}
