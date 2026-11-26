"use client";

import { addDays, isValidDate } from "@/lib/vibration/parse";

/** Ô chọn ngày kèm ‹ › và nút về hôm nay / ca hiện tại: khối `.mill-date` của web độ rung cũ. */
export function EntryDateBar({
  label, date, onChange, resetLabel, onReset, inputId, resetTitle,
}: {
  label: string;
  date: string;
  onChange: (date: string) => void;
  resetLabel: string;
  onReset: () => void;
  inputId?: string;
  resetTitle?: string;
}) {
  return (
    <div className="mill-date">
      <label>
        {label}
        <input
          id={inputId}
          type="date"
          value={date}
          min="1970-01-01"
          onChange={(e) => isValidDate(e.target.value) && onChange(e.target.value)}
        />
      </label>
      <button type="button" className="secondary-button small" title="Ngày trước" aria-label="Ngày trước" onClick={() => onChange(addDays(date, -1))}>‹</button>
      <button type="button" className="secondary-button small" title="Ngày sau" aria-label="Ngày sau" onClick={() => onChange(addDays(date, 1))}>›</button>
      <button type="button" className="secondary-button small" title={resetTitle ?? resetLabel} aria-label={resetTitle ?? resetLabel} onClick={onReset}>{resetLabel}</button>
    </div>
  );
}
