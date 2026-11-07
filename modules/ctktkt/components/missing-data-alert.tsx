"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

export type MissingDataItem = { key: string; label: string; group?: string };

/** Ô chứa nút cảnh báo trên hàng tiêu đề phân hệ (layout.tsx), bên trái "Chọn ô để sao chép Excel". */
export const HEADER_ALERTS_TARGET_ID = "ktkt-header-alerts";
const subscribeNoop = () => () => {};

/**
 * Cảnh báo ô thiếu số liệu (và lỗi tải dữ liệu nếu trang truyền vào) gom thành MỘT nút trên hàng tiêu đề;
 * bấm nút mở bảng chi tiết. Lỗi mới xuất hiện thì tự mở bảng để không bị bỏ sót.
 * Chưa có ô đích (lúc server render) thì chưa vẽ gì.
 */
export function MissingDataAlert({ items, loading = false, scope, errors = [] }: { items: MissingDataItem[]; loading?: boolean; scope: string; errors?: string[] }) {
  const target = useSyncExternalStore(subscribeNoop, () => document.getElementById(HEADER_ALERTS_TARGET_ID), () => null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const errorKey = errors.join("\n");

  // Lỗi mới (lưu/đồng bộ/tải thất bại) → mở bảng chi tiết ngay (điều chỉnh state trong render, không qua effect).
  const [seenErrorKey, setSeenErrorKey] = useState(errorKey);
  if (seenErrorKey !== errorKey) {
    setSeenErrorKey(errorKey);
    if (errorKey) setOpen(true);
  }
  // Đóng khi bấm ra ngoài hoặc nhấn Esc.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!target) return null;

  const hasErrors = errors.length > 0;
  const tone = hasErrors ? "border-red-300 bg-red-50 text-red-800 hover:bg-red-100"
    : loading ? "border-slate-200 bg-white text-slate-500"
    : items.length ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
    : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100";
  const label = loading && !hasErrors ? "Đang kiểm tra…"
    : [items.length ? `Thiếu ${items.length} ô` : hasErrors ? "" : "Đủ số liệu", hasErrors ? `${errors.length} lỗi` : ""].filter(Boolean).join(" · ");
  const Icon = !hasErrors && !items.length ? CheckCircle2 : AlertTriangle;

  const grouped = new Map<string, MissingDataItem[]>();
  for (const item of items) {
    const group = item.group || "Chưa phân nhóm";
    grouped.set(group, [...(grouped.get(group) || []), item]);
  }

  return createPortal(
    <div ref={rootRef} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="dialog" disabled={loading && !hasErrors} onClick={() => setOpen(value => !value)}
        title={`Ô thiếu số liệu trong ${scope}`}
        className={`inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm font-semibold shadow-sm ${tone}`}>
        <Icon className="size-4 shrink-0" aria-hidden />{label}
      </button>
      {open && <div role="dialog" aria-label={`Ô thiếu số liệu trong ${scope}`}
        className="absolute left-0 top-full z-40 mt-2 w-[min(640px,calc(100vw-2rem))] rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950 shadow-xl sm:left-auto sm:right-0">
        <div className="flex items-start gap-2">
          <p className="flex-1 text-sm font-bold">
            {items.length ? `Ô thiếu số liệu: còn ${items.length} ô/mục trong ${scope}` : `Ô thiếu số liệu: không phát hiện ô bắt buộc còn trống trong ${scope}.`}
          </p>
          <button type="button" onClick={() => setOpen(false)} aria-label="Đóng" className="grid size-8 shrink-0 place-items-center rounded-md text-amber-800 hover:bg-amber-100"><X className="size-4" aria-hidden /></button>
        </div>
        {hasErrors && <ul className="mt-2 space-y-1">{errors.map(text => <li key={text} role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{text}</li>)}</ul>}
        {items.length > 0 && <div className="mt-2 grid max-h-[55vh] gap-2 overflow-auto border-t border-amber-200 pt-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
          <p className="text-amber-800 sm:col-span-2 xl:col-span-3">Chỉ cảnh báo để kiểm tra, không ảnh hưởng thao tác lưu, đồng bộ hoặc xuất báo cáo.</p>
          {[...grouped].map(([group, groupItems]) => (
            <div key={group} className="rounded-lg bg-white/70 p-2">
              <p className="font-bold text-amber-900">{group} ({groupItems.length})</p>
              <ul className="mt-1 space-y-0.5 text-slate-700">{groupItems.map(item => <li key={item.key}>• {item.label}</li>)}</ul>
            </div>
          ))}
        </div>}
      </div>}
    </div>,
    target,
  );
}
