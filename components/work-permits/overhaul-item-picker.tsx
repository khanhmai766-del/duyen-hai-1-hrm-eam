"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, ListChecks, Loader2, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useOverhaulItems, usePermitCompanySummary, useSyncOverhaulItems, type OverhaulSyncResult } from "@/hooks/useWorkPermits";
import { normalizeText } from "@/lib/nav";
import { compareOverhaulCodes, isOverhaulPaperPermit, overhaulContentText, withOverhaulCodesLine, type OverhaulItemOption, type OverhaulItemSnapshot } from "@/lib/work-permit-overhaul";
import { companyAllowsScope, effectivePermitFormat, type PermitInput } from "@/lib/work-permits";

const keyOf = (item: Pick<OverhaulItemSnapshot, "sheet" | "code">) => `${item.sheet}\u0000${item.code}`;
const snapshotOf = (item: OverhaulItemOption, confirmedShared = false): OverhaulItemSnapshot =>
  ({ code: item.code, device: item.device, content: item.content, method: item.method, source: item.source, sheet: item.sheet, ...(confirmedShared ? { confirmedShared } : {}) });
const heldText = (item: OverhaulItemOption) => item.usedBy.map(usage => usage.number).join(", ");
/** Hạng mục đang nằm trong PCT khác còn hiệu lực: được đưa thêm vào phiếu này nhưng phải xác nhận. */
const confirmShared = (items: OverhaulItemOption[]) => window.confirm(items.length === 1
  ? `Hạng mục ${items[0].code} đang nằm trong PCT số ${heldText(items[0])} (chưa huỷ / kết thúc phiếu).\n\nVẫn thêm hạng mục này vào phiếu mới?`
  : `Các hạng mục sau đang nằm trong PCT khác chưa huỷ / kết thúc phiếu:\n${items.map(item => `• ${item.code} — PCT ${heldText(item)}`).join("\n")}\n\nVẫn thêm vào phiếu mới?`);

/**
 * Nút "Chọn hạng mục đại tu" + chip mã đã chọn, đặt dưới ô Nội dung công việc của PCT nhà thầu · Đại tu.
 * Chọn xong: cuối Nội dung có khối gợi ý "Theo hạng mục:" + từng dòng "- <mã> - <nội dung>" (thay khối cũ); chi tiết từng mã in ở phụ lục.
 */
export function OverhaulContentField({ form, onApply, onExtraChange }: {
  form: PermitInput;
  /** Phiếu MỚI (chưa lưu): bật/tắt "Hạng mục phát sinh" khi không chọn hạng mục nào. Không truyền = không hiện ô tick. */
  onExtraChange?: (extra: boolean) => void;
  /**
   * `content` = null → giữ nguyên nội dung người dùng đã sửa tay. `company` khác null khi phiếu CHƯA có đơn vị công
   * tác và người dùng chọn nhà thầu ngay trong hộp chọn (PCT Điện chọn đơn vị ở bước Nhân sự, sau bước này).
   */
  onApply: (items: OverhaulItemSnapshot[], content: string | null, company: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!isOverhaulPaperPermit({ ...form, format: effectivePermitFormat(form) })) return null;
  const items = form.overhaulItems ?? [];
  // Nội dung = phần người dùng gõ + khối gợi ý mã hạng mục (thay khối cũ khi chọn lại). Câu tự điền
  // kiểu cũ ("Đại tu … theo hạng mục …") đã chứa mã nên bỏ đi, chỉ giữ khối mới.
  const base = form.content.trim() === overhaulContentText(items) ? "" : form.content;
  const apply = (next: OverhaulItemSnapshot[], company: string | null = null) => onApply(next, withOverhaulCodesLine(base, next), company);

  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setOpen(true)}>
        <ListChecks />Chọn hạng mục đại tu
      </Button>
      {items.map(item => <span key={keyOf(item)} className="inline-flex h-7 items-center gap-1 rounded-full bg-violet-50 pl-2.5 pr-1 font-mono text-xs font-semibold text-violet-800 dark:bg-violet-950/40 dark:text-violet-200" title={[item.device, item.content].filter(Boolean).join(" — ")}>
        {item.code}
        <button type="button" className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-violet-100 dark:hover:bg-violet-900" aria-label={`Bỏ hạng mục ${item.code}`} onClick={() => apply(items.filter(other => keyOf(other) !== keyOf(item)))}><X className="h-3.5 w-3.5" /></button>
      </span>)}
    </div>
    {items.length > 0 && <p className="text-xs text-muted-foreground">Chi tiết {items.length} hạng mục (nội dung, biện pháp thi công) in ở phụ lục kèm PCT.</p>}
    {/* Công việc chưa có trong danh sách hạng mục: tạo hạng mục phát sinh PS.1.x ghi lên Sheet tiến độ (06/10/2026). */}
    {onExtraChange && !items.length && <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-xs leading-5 ${form.overhaulExtra ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100" : "border-border text-muted-foreground"}`}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600" checked={Boolean(form.overhaulExtra)} onChange={event => onExtraChange(event.target.checked)} />
      {/* Mặc định KHÔNG tick (08/10/2026). Tick → web tạo mã PS.1.x ở tab cương vị của file tiến độ, ghi tiến độ như hạng mục thường. */}
      <span><b className="text-[13px] text-foreground">Hạng mục phát sinh</b> — công việc chưa có trong danh sách hạng mục để chọn lựa. Lựa chọn để phân loại, ghi nhận lại.</span>
    </label>}
    {open && <OverhaulItemPicker form={form} selected={items} onClose={() => setOpen(false)} onConfirm={(next, company) => { apply(next, company); setOpen(false); }} />}
  </div>;
}

function OverhaulItemPicker({ form, selected, onClose, onConfirm }: {
  form: PermitInput;
  selected: OverhaulItemSnapshot[];
  onClose: () => void;
  onConfirm: (items: OverhaulItemSnapshot[], company: string | null) => void;
}) {
  // Nhà thầu: theo đơn vị công tác của phiếu (khoá, đổi ở form); phiếu chưa có đơn vị thì chọn ngay tại đây.
  const lockedCompany = form.teamName.trim();
  const [company, setCompany] = useState(lockedCompany);
  const companies = usePermitCompanySummary();
  const query = useOverhaulItems({ kind: form.kind, company, position: form.position, excludePermitId: form.id }, Boolean(company));
  const sync = useSyncOverhaulItems();
  const [picked, setPicked] = useState(() => new Map(selected.map(item => [keyOf(item), item])));
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const data = query.data;

  const groups = useMemo(() => {
    const term = normalizeText(search.trim());
    const rows = (data?.items ?? []).filter(item => !term || normalizeText(`${item.code} ${item.device} ${item.content}`).includes(term));
    // Nhóm theo loại + thiết bị: hạng mục cùng loại với phiếu lên trước, loại kia (Cơ ↔ Điện) xếp sau và có nhãn.
    const byDevice = new Map<string, { device: string; other: boolean; rows: OverhaulItemOption[] }>();
    for (const item of rows) {
      const device = item.device || "Chưa ghi thiết bị";
      const other = item.kind !== form.kind;
      const key = `${other ? 1 : 0}\u0000${item.kind}\u0000${device}`;
      const group = byDevice.get(key) ?? { device, other, rows: [] };
      group.rows.push(item);
      byDevice.set(key, group);
    }
    return [...byDevice.entries()].sort((a, b) => Number(a[1].other) - Number(b[1].other) || compareOverhaulCodes(a[1].rows[0].code, b[1].rows[0].code));
  }, [data, search, form.kind]);

  const toggle = (item: OverhaulItemOption) => {
    const key = keyOf(item);
    if (picked.has(key)) { setPicked(prev => { const next = new Map(prev); next.delete(key); return next; }); return; }
    const shared = item.usedBy.length > 0;
    if (shared && !confirmShared([item])) return;
    setPicked(prev => new Map(prev).set(key, snapshotOf(item, shared)));
  };
  /** Áp dụng: mục đang trong PCT khác mà chưa xác nhận (chọn từ trước, vd phiếu nháp cũ) → hỏi một lần cho cả nhóm. */
  function apply() {
    const byKey = new Map((data?.items ?? []).map(item => [keyOf(item), item]));
    const unconfirmed = [...picked.values()].filter(item => !item.confirmedShared).map(item => byKey.get(keyOf(item))).filter((item): item is OverhaulItemOption => Boolean(item?.usedBy.length));
    if (unconfirmed.length && !confirmShared(unconfirmed)) return;
    const flagged = new Set(unconfirmed.map(keyOf));
    const items = [...picked.values()].map(item => flagged.has(keyOf(item)) ? { ...item, confirmedShared: true } : item);
    onConfirm(items.sort((a, b) => compareOverhaulCodes(a.code, b.code)), lockedCompany ? null : company || null);
  }

  async function runSync() {
    try {
      const result = await sync.mutateAsync();
      toast.success("Đã đồng bộ tiến độ đại tu", { description: syncSummary(result) });
    } catch (error) {
      toast.error("Không đồng bộ được", { description: (error as Error).message });
    }
  }

  const empty = Boolean(company) && !query.isPending && !query.isError && groups.length === 0;
  return <Dialog open onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 p-0 sm:w-full">
      <div className="space-y-3 border-b border-border px-4 pb-3 pt-4 sm:px-5">
        <div className="pr-8">
          <DialogTitle>Chọn hạng mục đại tu</DialogTitle>
          <DialogDescription className="mt-1">
            {`PCT ${kindLabel(form.kind)}`}
            {form.position ? ` · ${form.position}` : " · mọi cương vị"}
            {` · hiện cả hạng mục ${kindLabel(form.kind === "MECHANICAL" ? "ELECTRICAL" : "MECHANICAL")} (xếp sau)`}
          </DialogDescription>
        </div>
        <label className="block space-y-1 text-xs">
          <span className="font-medium text-muted-foreground">Nhà thầu{lockedCompany ? " (theo đơn vị công tác của phiếu)" : ""}</span>
          <select className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:opacity-80"
            value={company} disabled={Boolean(lockedCompany)} onChange={event => setCompany(event.target.value)}>
            <option value="">{companies.isPending ? "Đang tải đơn vị nhà thầu…" : "Chọn nhà thầu để xem hạng mục"}</option>
            {company && !(companies.data?.data ?? []).some(row => row.company === company) && <option value={company}>{company}</option>}
            {/* Chỉ đơn vị được cấp PCT Đại tu (hoặc chưa phân loại) — cùng quy tắc máy chủ chặn khi lưu. */}
            {(companies.data?.data ?? []).filter(row => companyAllowsScope(row, "OVERHAUL")).map(row => <option key={row.company} value={row.company}>{row.code ? `${row.code} · ${row.company}` : row.company}</option>)}
          </select>
        </label>
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
        {!company && <p className="px-4 py-10 text-center text-sm text-muted-foreground">Chọn nhà thầu ở trên để xem hạng mục của đơn vị đó.</p>}
        {company && query.isPending && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
        {query.isError && <p role="alert" className="px-2 py-6 text-center text-sm text-red-700">{query.error.message}</p>}
        {empty && <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyMessage(data?.reason ?? null, data?.contractorCode ?? null, Boolean(search.trim()))}</p>}
        {groups.map(([groupKey, { device, other, rows }]) => <section key={groupKey} className="py-1">
          <h3 className="sticky top-0 z-10 flex items-center gap-2 bg-background/95 px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-600 backdrop-blur dark:text-muted-foreground">
            {other && <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">{kindLabel(rows[0].kind)}</span>}
            <span className="min-w-0">{device}</span>
          </h3>
          {rows.map(item => {
            const key = keyOf(item);
            const checked = picked.has(key);
            const showMethod = expanded === key;
            // Đã nằm trong PCT khác còn hiệu lực: làm mờ để dễ nhận ra, vẫn chọn được sau khi xác nhận.
            const shared = item.usedBy.length > 0 && !checked;
            return <div key={key} className={`rounded-lg px-2 py-2 ${checked ? "bg-violet-50 dark:bg-violet-950/30" : shared ? "opacity-60 hover:opacity-100" : "hover:bg-slate-50 dark:hover:bg-muted/40"}`}>
              <label className="flex min-h-10 cursor-pointer items-start gap-3">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-violet-700" checked={checked} onChange={() => toggle(item)} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-sm font-bold text-violet-800 dark:text-violet-200">{item.code}</span>
                    {item.status && <span className="text-xs text-muted-foreground">{item.status}{item.percent ? ` · ${item.percent}` : ""}</span>}
                  </span>
                  <span className="mt-0.5 block whitespace-pre-line text-sm leading-5 text-foreground">{item.content || "—"}</span>
                  {item.usedBy.length > 0 && <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-300">Đã có trong PCT số {heldText(item)}</span>}
                  {!item.usedBy.length && item.draftIn.length > 0 && <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">Đang nằm trong phiếu nháp {item.draftIn.join(", ")}</span>}
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
          <Button type="button" className="h-10" onClick={apply}>Áp dụng{picked.size ? ` (${picked.size})` : ""}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

const kindLabel = (kind: string) => kind === "MECHANICAL" ? "Cơ – Nhiệt – Hóa" : "Điện";

function emptyMessage(reason: "company" | "companyCode" | null, contractorCode: string | null, searching: boolean) {
  if (reason === "company") return "Chọn đơn vị công tác để xem hạng mục.";
  if (reason === "companyCode") return "Đơn vị này chưa khai mã viết tắt (vd IDC) trong danh bạ nhà thầu — cột “Nhà thầu” trên file tiến độ khớp theo mã đó.";
  if (searching) return "Không có hạng mục khớp từ khoá.";
  return `Chưa có hạng mục nào ghi nhà thầu ${contractorCode ?? ""} cho cương vị này. Kiểm tra cột “Nhà thầu” trên file tiến độ, hoặc bấm Đồng bộ.`;
}

function syncSummary(result: OverhaulSyncResult) {
  return result.sources.filter(source => source.configured).map(source => {
    if (source.error) return `${source.label}: lỗi — ${source.error}`;
    const notes = [
      source.unmatchedPositions.length ? `cương vị chưa khớp: ${source.unmatchedPositions.join(", ")}` : "",
      source.unknownContractors.length ? `nhà thầu chưa có trong danh bạ: ${source.unknownContractors.join(", ")}` : "",
    ].filter(Boolean).join("; ");
    return `${source.label}: ${source.mechanical} Cơ · ${source.electrical} Điện${notes ? ` (${notes})` : ""}`;
  }).join(" · ") || "Chưa cấu hình file nào.";
}
