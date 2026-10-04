"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { overhaulItemKey, type OverhaulItemProgress, type OverhaulItemSnapshot } from "@/lib/work-permit-overhaul";

export type OverhaulProgressDraft = Record<string, { done: boolean; percent: string; note: string }>;

const control = "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";

/** `preDone`: mục tick sẵn (đã "Cập nhật tiến độ" hôm nay trong lần đang mở — mở hộp Kết thúc). */
export function initialOverhaulDraft(items: OverhaulItemSnapshot[], previous: Record<string, number>, preDone: Set<string> = new Set()): OverhaulProgressDraft {
  return Object.fromEntries(items.map(item => [overhaulItemKey(item), { done: preDone.has(overhaulItemKey(item)), percent: String(previous[overhaulItemKey(item)] ?? 0), note: "" }]));
}

/** Lỗi nhập (tiếng Việt) hoặc null. `noneDone` = null: không có lựa chọn "không mục nào" (Cập nhật tiến độ). */
export function overhaulDraftError(items: OverhaulItemSnapshot[], draft: OverhaulProgressDraft, previous: Record<string, number>, noneDone: boolean | null) {
  const done = items.filter(item => draft[overhaulItemKey(item)]?.done);
  if (!done.length) {
    if (noneDone === null) return "Tick ít nhất một hạng mục đã thực hiện để cập nhật tiến độ.";
    if (!noneDone) return "Tick hạng mục đã thực hiện, hoặc xác nhận không hạng mục nào được thực hiện.";
  }
  for (const item of done) {
    const raw = draft[overhaulItemKey(item)].percent;
    const percent = Number(raw);
    if (raw === "" || !Number.isInteger(percent) || percent < 0 || percent > 100) return `Tiến độ hạng mục ${item.code} phải là số nguyên 0–100%.`;
    const before = previous[overhaulItemKey(item)];
    if (before !== undefined && percent < before) return `Tiến độ hạng mục ${item.code} là lũy kế — không thấp hơn lần trước (${before}%).`;
  }
  return null;
}

export function overhaulDraftPayload(items: OverhaulItemSnapshot[], draft: OverhaulProgressDraft): OverhaulItemProgress[] {
  return items.map(item => {
    const entry = draft[overhaulItemKey(item)];
    return { code: item.code, sheet: item.sheet, source: item.source, done: Boolean(entry?.done), percent: entry?.done ? Number(entry.percent) : null, note: entry?.done ? entry.note.trim() : "" };
  });
}

/**
 * Đánh giá TỪNG hạng mục đại tu khi kết thúc lần làm việc: tick mục đã làm → nhập % lũy kế + ghi chú. Kết quả ghi về
 * Sheet tiến độ (ô ngày, Nhật ký ngày, % Hoàn thành, Trạng thái hiện tại). Mục không tick ghi "Không thực hiện".
 */
export function OverhaulItemProgressEditor({ items, previous, draft, onChange, noneDone, onNoneDone, updating = false, scroll = true }: {
  items: OverhaulItemSnapshot[];
  previous: Record<string, number>;
  draft: OverhaulProgressDraft;
  onChange: (next: OverhaulProgressDraft) => void;
  noneDone: boolean;
  onNoneDone: (value: boolean) => void;
  /** Cập nhật tiến độ giữa chừng: không có ô "không mục nào thực hiện", lời dẫn khác. */
  updating?: boolean;
  /** false: không giới hạn chiều cao (trang liệt kê nhiều phiếu tự cuộn cả trang, tránh cuộn lồng nhau). */
  scroll?: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const set = (key: string, patch: Partial<OverhaulProgressDraft[string]>) => {
    onChange({ ...draft, [key]: { ...draft[key], ...patch } });
    if (patch.done) onNoneDone(false);
  };
  const doneCount = items.filter(item => draft[overhaulItemKey(item)]?.done).length;
  return <fieldset className="space-y-2">
    <legend className="text-sm font-medium">Tiến độ từng hạng mục * <span className="font-normal text-muted-foreground">· đã tick {doneCount}/{items.length}</span></legend>
    <p className="text-xs text-muted-foreground">{updating
      ? "Tick hạng mục vừa thực hiện, ghi % lũy kế và nội dung đã làm. Kết quả ghi về Sheet tiến độ đại tu."
      : "Tick hạng mục đã thực hiện trong lần này, ghi % lũy kế và nội dung đã làm. Kết quả được ghi về Sheet tiến độ đại tu theo ngày kết thúc."}</p>
    <div className={scroll ? "max-h-[50dvh] space-y-2 overflow-y-auto pr-1" : "space-y-2"}>
      {items.map(item => {
        const key = overhaulItemKey(item);
        const entry = draft[key] ?? { done: false, percent: "0", note: "" };
        const before = previous[key];
        const showMethod = expanded === key;
        return <div key={key} className={`rounded-lg border p-3 ${entry.done ? "border-violet-300 bg-violet-50/60 dark:border-violet-800 dark:bg-violet-950/30" : "border-border"}`}>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-violet-700" checked={entry.done} onChange={e => set(key, { done: e.target.checked })} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-sm font-bold text-violet-800 dark:text-violet-200">{item.code}</span>
                {item.device && <span className="text-xs text-muted-foreground">{item.device}</span>}
                <span className="text-xs text-muted-foreground">{before !== undefined ? `· lần trước ${before}%` : "· chưa có tiến độ"}</span>
              </span>
              <span className="mt-0.5 line-clamp-3 block whitespace-pre-line text-sm leading-5">{item.content || "—"}</span>
            </span>
          </label>
          {item.method && <div className="pl-8">
            <button type="button" className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-300" onClick={() => setExpanded(showMethod ? null : key)}>
              {showMethod ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}Biện pháp thi công
            </button>
            {showMethod && <p className="mt-1 whitespace-pre-line rounded-md bg-slate-50 p-2 text-xs leading-5 text-slate-700 dark:bg-muted/40 dark:text-muted-foreground">{item.method}</p>}
          </div>}
          {entry.done && <div className="mt-2 space-y-2 sm:pl-8">
            <div className="flex items-center gap-3">
              <input aria-label={`Tiến độ lũy kế hạng mục ${item.code}`} className="h-2 min-w-0 flex-1 cursor-pointer accent-violet-700" type="range" min={before ?? 0} max={100} step={1} value={entry.percent || 0} onChange={e => set(key, { percent: e.target.value })} />
              <div className="relative w-24 shrink-0"><input aria-label={`% hạng mục ${item.code}`} className={`${control} pr-7 text-right tabular-nums`} type="number" inputMode="numeric" min={before ?? 0} max={100} step={1} value={entry.percent} onChange={e => set(key, { percent: e.target.value })} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span></div>
            </div>
            <textarea aria-label={`Ghi chú hạng mục ${item.code}`} className={control} rows={2} maxLength={1000} placeholder="Nội dung đã thực hiện trong lần này (ghi vào Nhật ký ngày)" value={entry.note} onChange={e => set(key, { note: e.target.value })} />
          </div>}
        </div>;
      })}
    </div>
    {!updating && doneCount === 0 && <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-amber-600" checked={noneDone} onChange={e => onNoneDone(e.target.checked)} />
      Không hạng mục nào được thực hiện trong lần làm việc này (Sheet ghi “Không thực hiện”)
    </label>}
  </fieldset>;
}
