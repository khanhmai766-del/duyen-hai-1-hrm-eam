"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";

export type MissingDataItem = { key: string; label: string; group?: string };

export function MissingDataAlert({ items, loading = false, scope }: { items: MissingDataItem[]; loading?: boolean; scope: string }) {
  if (loading) {
    return <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">Đang kiểm tra ô thiếu số liệu…</div>;
  }

  if (items.length === 0) {
    return (
      <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden />
        <span><strong>Ô thiếu số liệu:</strong> Không phát hiện ô bắt buộc còn trống trong {scope}.</span>
      </div>
    );
  }

  const grouped = new Map<string, MissingDataItem[]>();
  for (const item of items) {
    const group = item.group || "Chưa phân nhóm";
    grouped.set(group, [...(grouped.get(group) || []), item]);
  }

  return (
    <details open className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-amber-950 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold">
        <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
        Ô thiếu số liệu: còn {items.length} ô/mục trong {scope}
        <span className="ml-auto text-xs font-medium text-amber-700">Bấm để thu gọn</span>
      </summary>
      <div className="mt-2 grid max-h-52 gap-2 overflow-auto border-t border-amber-200 pt-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
        <p className="sm:col-span-2 xl:col-span-3 text-amber-800">
          Chỉ cảnh báo để kiểm tra, không ảnh hưởng thao tác lưu, đồng bộ hoặc xuất báo cáo.
        </p>
        {[...grouped].map(([group, groupItems]) => (
          <div key={group} className="rounded-lg bg-white/70 p-2">
            <p className="font-bold text-amber-900">{group} ({groupItems.length})</p>
            <ul className="mt-1 space-y-0.5 text-slate-700">
              {groupItems.map(item => <li key={item.key}>• {item.label}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
