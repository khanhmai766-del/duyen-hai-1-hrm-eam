"use client";

import { useRef, useState } from "react";
import { displayToIsoDate, isoToDisplayDate } from "@/lib/tcms/lib/date-utils";

export interface VietnameseDateInputProps {
  value?: string;
  onChange: (value?: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

export function VietnameseDateInput({
  value,
  onChange,
  className = "mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-[11px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100",
  placeholder = "dd/mm/yyyy",
  disabled = false,
  required = false,
  id,
  name,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: VietnameseDateInputProps) {
  const [displayValue, setDisplayValue] = useState<string>(() => isoToDisplayDate(value));
  const [error, setError] = useState<string | null>(null);
  const [lastExternalValue, setLastExternalValue] = useState(value);
  const hiddenDateInputRef = useRef<HTMLInputElement>(null);

  if (value !== lastExternalValue) {
    setLastExternalValue(value);
    setDisplayValue(isoToDisplayDate(value));
    setError(null);
  }

  function handleTextChange(inputStr: string) {
    setDisplayValue(inputStr);
    const trimmed = inputStr.trim();
    if (!trimmed) {
      setError(null);
      onChange(undefined);
      return;
    }

    const iso = displayToIsoDate(trimmed);
    if (iso) {
      setError(null);
      onChange(iso);
    }
  }

  function handleBlur() {
    const trimmed = displayValue.trim();
    if (!trimmed) {
      setError(null);
      return;
    }

    const iso = displayToIsoDate(trimmed);
    if (iso === null) {
      setError("Ngày không hợp lệ (dd/mm/yyyy)");
    } else {
      setError(null);
      setDisplayValue(isoToDisplayDate(iso));
      onChange(iso);
    }
  }

  function handleCalendarButtonClick() {
    if (disabled) return;
    try {
      hiddenDateInputRef.current?.showPicker();
    } catch {
      hiddenDateInputRef.current?.focus();
      hiddenDateInputRef.current?.click();
    }
  }

  function handleNativePickerChange(nativeIso: string) {
    if (!nativeIso) {
      setDisplayValue("");
      setError(null);
      onChange(undefined);
      return;
    }
    const display = isoToDisplayDate(nativeIso);
    setDisplayValue(display);
    setError(null);
    onChange(nativeIso);
  }

  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
        <input
          type="text"
          id={id}
          name={name}
          value={displayValue}
          onChange={(event) => handleTextChange(event.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          className={`${className} ${error ? "border-red-300 focus:border-red-400 focus:ring-red-100" : ""}`}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={handleCalendarButtonClick}
          title="Chọn từ lịch"
          aria-label="Chọn ngày từ lịch"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
      </div>

      <input
        type="date"
        ref={hiddenDateInputRef}
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        value={value ?? ""}
        onChange={(event) => handleNativePickerChange(event.target.value)}
        className="sr-only"
      />

      {error && (
        <p className="mt-0.5 text-[9px] font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
