"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, ListChecks, Loader2, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useOverhaulItems, useSyncOverhaulItems, type OverhaulSyncResult } from "@/hooks/useWorkPermits";
import { normalizeText } from "@/lib/nav";
import { compareOverhaulCodes, overhaulContentText, type OverhaulItemOption, type OverhaulItemSnapshot } from "@/lib/work-permit-overhaul";
import type { PermitInput } from "@/lib/work-permits";

const keyOf = (item: Pick<OverhaulItemSnapshot, "sheet" | "code">) => `${item.sheet}\u0000${item.code}`;
const snapshotOf = (item: OverhaulItemOption): OverhaulItemSnapshot =>
  ({ code: item.code, device: item.device, content: item.content, method: item.method, source: item.source, sheet: item.sheet });

/**
 * Nút "Chọn hạng mục đại tu" + chip mã đã chọn, đặt dưới ô Nội dung công việc của PCT nhà thầu · Đại tu.
 * Chọn xong: Nội dung được điền "Đại tu <thiết bị> theo hạng mục 1.1.1, 1.1.2"; chi tiết từng mã in ở phụ lục.
 */
export function OverhaulContentField({ form, onApply }: {
  form: PermitInput;
  /** `content` = null → giữ nguyên nội dung người dùng đã sửa tay. */
  onApply: (items: OverhaulItemSnapshot[], content: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  if (form.teamType !== "CONTRACTOR" || form.contractorScope !== "OVERHAUL") return null;
  const items = form.overhaulItems ?? [];
  // Nội dung còn đúng câu tự điền thì cập nhật theo mã; người dùng đã sửa tay thì không đè.
  const contentIsGenerated = !form.content.trim() || form.content.trim() === overhaulContentText(items);
  const apply = (next: OverhaulItemSnapshot[]) => onApply(next, contentIsGenerated ? overhaulContentText(next) : null);

  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" className="h-9" disabled={!form.teamName} onClick={() => setOpen(true)}>
        <ListChecks />Chọn hạng mục đại tu
      </Button>
      {!form.teamName && <span className="text-xs text-muted-foreground">Chọn đơn vị công tác để xem hạng mục của nhà thầu.</span>}
      {items.map(item => <span key={keyOf(item)} className="inline-flex h-7 items-center gap-1 rounded-full bg-violet-50 pl-2.5 pr-1 font-mono text-xs font-semibold text-violet-800 dark:bg-violet-950/40 dark:text-violet-200" title={[item.device, item.content].filter(Boolean).join(" — ")}>
        {item.code}
        <button type="button" className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-violet-100 dark:hover:bg-violet-900" aria-label={`Bỏ hạng mục ${item.code}`} onClick={() => apply(items.filter(other => keyOf(other) !== keyOf(item)))}><X className="h-3.5 w-3.5" /></button>
      </span>)}
    </div>
    {items.length > 0 && <p className="text-xs text-muted-foreground">Chi tiết {items.length} hạng mục (nội dung, biện pháp thi công) in ở phụ lục kèm PCT.</p>}
    {open && <OverhaulItemPicker form={form} selected={items} onClose={() => setOpen(false)} onConfirm={next => { apply(next); setOpen(false); }} />}
  </div>;
}

function OverhaulItemPicker({ form, selected, onClose, onConfirm }: {
  form: PermitInput;
  selected: OverhaulItemSnapshot[];
  onClose: () => void;
  onConfirm: (items: OverhaulItemSnapshot[]) => void;
}) {
  const query = useOverhaulItems({ kind: form.kind, company: form.teamName, position: form.position }, true);
  const sync = useSyncOverhaulItems();
  const [picked, setPicked] = useState(() => new Map(selected.map(item => [keyOf(item), item])));
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const data = query.data;

  const groups = useMemo(() => {
    const term = normalizeText(search.trim());
    const rows = (data?.items ?? []).filter(item => !term || normalizeText(`${item.code} ${item.device} ${item.content}`).includes(term));
    const byDevice = new Map<string, OverhaulItemOption[]>();
    for (const item of rows) {
      const device = item.device || "Chưa ghi thiết bị";
      byDevice.set(device, [...(byDevice.get(device) ?? []), item]);
    }
    return [...byDevice.entries()].sort((a, b) => compareOverhaulCodes(a[1][0].code, b[1][0].code));
  }, [data, search]);

  const toggle = (item: OverhaulItemOption) => setPicked(prev => {
    const next = new Map(prev);
    if (next.has(keyOf(item))) next.delete(keyOf(item)); else next.set(keyOf(item), snapshotOf(item));
    return next;
  });

  async function runSync() {
    try {
      const result = await sync.mutateAsync();
      toast.success("Đã đồng bộ tiến độ đại tu", { description: syncSummary(result) });
    } catch (error) {
      toast.error("Không đồng bộ được", { description: (error as Error).message });
    }
  }

  const empty = !query.isPending && !query.isError && groups.length === 0;
  return <Dialog open onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 p-0 sm:w-full">
      <div className="space-y-3 border-b border-border px-4 pb-3 pt-4 sm:px-5">
        <div className="pr-8">
          <DialogTitle>Chọn hạng mục đại tu</DialogTitle>
          <DialogDescription className="mt-1">
            {data?.contractorCode ? `Nhà thầu ${data.contractorCode}` : form.teamName}
            {` · PCT ${form.kind === "MECHANICAL" ? "Cơ – Nhiệt – Hóa" : "Điện"}`}
            {form.position ? ` · ${form.position}` : " · mọi cương vị"}
          </DialogDescription>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10" placeholder="Tìm mã, thiết bị, nội dung…" value={search} onChange={event => setSearch(event.target.value)} />
          </label>
          <Button type="button" variant="outline" className="h-10 shrink-0" disabled={sync.isPending} onClick={runSync}>
            {sync.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}Đồng bộ
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {data?.syncedAt ? `Đồng bộ từ Google Sheets lúc ${new Date(data.syncedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}` : "Chưa đồng bộ lần nào — bấm Đồng bộ để lấy hạng mục từ file tiến độ đại tu."}
        </p>
      </div>

      <div className="min-h-[12rem] flex-1 overflow-y-auto px-2 py-2 sm:px-3">
        {query.isPending && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
        {query.isError && <p role="alert" className="px-2 py-6 text-center text-sm text-red-700">{query.error.message}</p>}
        {empty && <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyMessage(data?.reason ?? null, data?.contractorCode ?? null, Boolean(search.trim()))}</p>}
        {groups.map(([device, rows]) => <section key={device} className="py-1">
          <h3 className="sticky top-0 z-10 bg-background/95 px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-600 backdrop-blur dark:text-muted-foreground">{device}</h3>
          {rows.map(item => {
            const key = keyOf(item);
            const checked = picked.has(key);
            const showMethod = expanded === key;
            return <div key={key} className={`rounded-lg px-2 py-2 ${checked ? "bg-violet-50 dark:bg-violet-950/30" : "hover:bg-slate-50 dark:hover:bg-muted/40"}`}>
              <label className="flex min-h-10 cursor-pointer items-start gap-3">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-violet-700" checked={checked} onChange={() => toggle(item)} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-sm font-bold text-violet-800 dark:text-violet-200">{item.code}</span>
                    {item.status && <span className="text-xs text-muted-foreground">{item.status}{item.percent ? ` · ${item.percent}` : ""}</span>}
                  </span>
                  <span className="mt-0.5 block whitespace-pre-line text-sm leading-5 text-foreground">{item.content || "—"}</span>
                </span>
              </label>
              {item.method && <div className="pl-8">
                <button type="button" className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-300" onClick={() => setExpanded(showMethod ? null : key)}>
                  {showMethod ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}Biện pháp thi công
                </button>
                {showMethod && <p className="mt-1 whitespace-pre-line rounded-md bg-slate-50 p-2 text-xs leading-5 text-slate-700 dark:bg-muted/40 dark:text-muted-foreground">{item.method}</p>}
              </div>}
            </div>;
          })}
        </section>)}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <span className="hidden text-sm text-muted-foreground sm:inline">Đã chọn <b className="text-foreground">{picked.size}</b> hạng mục</span>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button type="button" variant="outline" className="h-10" onClick={onClose}>Huỷ</Button>
          <Button type="button" className="h-10" onClick={() => onConfirm([...picked.values()].sort((a, b) => compareOverhaulCodes(a.code, b.code)))}>Áp dụng{picked.size ? ` (${picked.size})` : ""}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

function emptyMessage(reason: "company" | "companyCode" | null, contractorCode: string | null, searching: boolean) {
  if (reason === "company") return "Chọn đơn vị công tác để xem hạng mục.";
  if (reason === "companyCode") return "Đơn vị này chưa khai mã viết tắt (vd IDC) trong danh bạ nhà thầu — cột “Nhà thầu” trên file tiến độ khớp theo mã đó.";
  if (searching) return "Không có hạng mục khớp từ khoá.";
  return `Chưa có hạng mục nào ghi nhà thầu ${contractorCode ?? ""} cho loại phiếu và cương vị này. Kiểm tra cột “Nhà thầu” trên file tiến độ, hoặc bấm Đồng bộ.`;
}

function syncSummary(result: OverhaulSyncResult) {
  return result.sources.filter(source => source.configured).map(source => {
    if (source.error) return `${source.label}: lỗi — ${source.error}`;
    const unmatched = source.unmatchedTabs.length ? `; tab không khớp cương vị: ${source.unmatchedTabs.join(", ")}` : "";
    return `${source.label}: ${source.rows} hạng mục${unmatched}`;
  }).join(" · ") || "Chưa cấu hình file nào.";
}
