"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/** Chữ số gõ vào → "HH"/"mm" hợp lệ, hoặc null khi vượt giới hạn. */
function part(raw: string, max: number) {
  const n = Number(raw);
  return raw && n <= max ? String(n).padStart(2, "0") : null;
}

/**
 * Thay cho `<input type="datetime-local">`: ô đó hiện giờ theo ngôn ngữ trình duyệt (máy để tiếng Anh ra AM/PM),
 * nên tách thành ô ngày + ô giờ 00–23 + ô phút. Giờ/phút gõ số trực tiếp được, kèm danh sách gợi ý để chọn. Giá trị vào/ra giữ nguyên dạng `YYYY-MM-DDTHH:mm` ("" khi trống).
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

  const id = useId();
  const minuteRef = useRef<HTMLInputElement>(null);
  const emit = (d: string, h: string, m: string) => onChange(d ? `${d}T${h}:${m}` : "");
  const box = cn(className, "w-[4.25rem] shrink-0 px-2 text-center tabular-nums");

  // Chỉ phát giá trị khi đủ 2 chữ số (hoặc lúc rời ô) — phát sớm thì "2" bị đệm thành "02" ngay giữa lúc đang gõ.
  const type = (raw: string, max: number, set: (v: string) => void, commit: (v: string) => void, next?: () => void) => {
    const digits = raw.replace(/D/g, "").slice(0, 2);
    if (digits.length === 2 && part(digits, max) === null) return;
    set(digits);
    if (digits.length === 2) { commit(digits); next?.(); }
  };
  const leave = (raw: string, max: number, fallback: string, set: (v: string) => void, commit: (v: string) => void) => {
    const v = part(raw, max) ?? fallback;
    set(v);
    commit(v);
  };
  const savedHour = value.slice(11, 13) || "00";
  const savedMinute = value.slice(14, 16) || "00";

  return <div className="flex items-center gap-1.5">
    <input type="date" className={cn(className, "w-0 min-w-0 flex-1")} value={date} required={required} disabled={disabled} min={min?.slice(0, 10)}
      onChange={e => { setDate(e.target.value); emit(e.target.value, hour, minute); }} />
    <input aria-label="Giờ (00–23)" className={box} inputMode="numeric" autoComplete="off" placeholder="HH" list={`${id}-h`} value={hour} disabled={disabled}
      onFocus={e => e.target.select()}
      onChange={e => type(e.target.value, 23, setHour, h => emit(date, h, minute), () => minuteRef.current?.focus())}
      onBlur={e => leave(e.target.value, 23, savedHour, setHour, h => emit(date, h, minute))} />
    <span className="text-slate-500">:</span>
    <input ref={minuteRef} aria-label="Phút (00–59)" className={box} inputMode="numeric" autoComplete="off" placeholder="mm" list={`${id}-m`} value={minute} disabled={disabled}
      onFocus={e => e.target.select()}
      onChange={e => type(e.target.value, 59, setMinute, m => emit(date, hour, m))}
      onBlur={e => leave(e.target.value, 59, savedMinute, setMinute, m => emit(date, hour, m))} />
    <datalist id={`${id}-h`}>{HOURS.map(h => <option key={h} value={h} />)}</datalist>
    <datalist id={`${id}-m`}>{MINUTES.map(m => <option key={m} value={m} />)}</datalist>
  </div>;
}
