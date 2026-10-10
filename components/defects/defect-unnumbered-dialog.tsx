"use client";

import * as React from "react";
import { ArrowRight, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFECT_STATUS } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";
import { cn } from "@/lib/utils";
import {
  useDefectUnnumbered,
  useRefreshDefectUnnumbered,
  useWriteDefectUnnumbered,
  type DefectUnnumberedItem,
  type DefectUnnumberedSource,
  type DefectUnnumberedStatus,
} from "@/hooks/useDefectUnnumbered";

/*
 * Rà dòng khiếm khuyết CHƯA CÓ STT trên Sheet (10/10/2026): chỉ để cột 14 (KQ sửa chữa VH1) khớp "Kết quả thực hiện (SCCN)".
 * Không cấp số, không tạo phiếu — xem lib/server/defect-unnumbered.ts.
 */

const STATUS_ORDER = Object.keys(DEFECT_STATUS) as DefectUnnumberedStatus[];
const STALE_MS = 10 * 60 * 1000;
const UNITS = [{ value: "ALL", label: "Tất cả" }, { value: "S1", label: "S1" }, { value: "S2", label: "S2" }, { value: "COMMON", label: "Chung" }];
const timeFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

function StatusPill({ status }: { status: DefectUnnumberedStatus }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold", DEFECT_STATUS[status].badge)}>{DEFECT_STATUS[status].label}</span>;
}

export function DefectUnnumberedDialog({ source, open, onOpenChange }: { source: DefectUnnumberedSource; open: boolean; onOpenChange: (open: boolean) => void }) {
  const query = useDefectUnnumbered(source, open);
  const refresh = useRefreshDefectUnnumbered(source);
  const write = useWriteDefectUnnumbered(source);
  const [search, setSearch] = React.useState("");
  const [unit, setUnit] = React.useState("ALL");
  const [onlyMismatch, setOnlyMismatch] = React.useState(true);
  const [draft, setDraft] = React.useState<Record<string, DefectUnnumberedStatus>>({});
  const rows = React.useMemo(() => query.data?.data ?? [], [query.data]);
  const meta = query.data?.meta;
  const canEdit = meta?.canEdit === true;

  // Mở hộp mà ảnh chụp đã cũ (hoặc chưa đọc lần nào) thì tự đọc lại một lần.
  const lastReadAt = meta?.lastReadAt ?? null;
  const autoReadDone = React.useRef(false);
  const { mutate: refreshNow } = refresh;
  React.useEffect(() => {
    if (!open) { autoReadDone.current = false; return; }
    if (!query.isSuccess || autoReadDone.current) return;
    autoReadDone.current = true;
    if (!lastReadAt || Date.now() - new Date(lastReadAt).getTime() > STALE_MS) refreshNow(false, { onError: error => toast.error(error.message) });
  }, [open, query.isSuccess, lastReadAt, refreshNow]);

  const mismatchCount = rows.filter(row => row.mismatch).length;
  const filtered = React.useMemo(() => {
    const needle = normalizeText(search.trim());
    return rows.filter(row => (!onlyMismatch || row.mismatch)
      && (unit === "ALL" || row.unit === unit)
      && (!needle || normalizeText([row.content, row.deviceRaw, row.positionRaw, row.repairResultRaw, String(row.sourceRow)].join(" ")).includes(needle)));
  }, [rows, onlyMismatch, unit, search]);
  const suggestable = filtered.filter(row => row.mismatch && row.suggestedStatus);

  async function save(changes: Array<{ id: string; status: DefectUnnumberedStatus }>) {
    try {
      const result = await write.mutateAsync(changes);
      toast.success(result.written ? `Đã ghi cột 14 cho ${result.written} dòng lên Sheet` : "Không có gì thay đổi");
      setDraft(current => { const next = { ...current }; for (const change of changes) delete next[change.id]; return next; });
    } catch (error) { toast.error((error as Error).message); }
  }

  function applySuggestions() {
    if (!suggestable.length) return;
    if (!window.confirm(`Ghi cột 14 theo “Kết quả SCCN” cho ${suggestable.length} dòng đang lọc?\n\nWeb ghi thẳng lên Sheet, đúng dòng (đã kiểm lại nội dung trước khi ghi).`)) return;
    void save(suggestable.map(row => ({ id: row.id, status: row.suggestedStatus! })));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border bg-muted/25 px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-base sm:text-lg">Dòng chưa có số — {meta?.label ?? (source === "CO" ? "Sheet Cơ - Hóa" : "Sheet Điện")}</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            Rà cột 14 (KQ sửa chữa VH1) cho khớp “Kết quả thực hiện (SCCN)”, rồi ghi ngược lên Sheet. Không cấp số, không tạo phiếu trên web.
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
            <span>{lastReadAt ? `Đọc lúc ${timeFmt.format(new Date(lastReadAt))}` : "Chưa đọc lần nào"} · {rows.length} dòng thuộc cương vị của bạn</span>
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={refresh.isPending}
              onClick={() => refresh.mutate(true, { onSuccess: () => toast.success("Đã đọc lại từ Sheet"), onError: error => toast.error(error.message) })}>
              {refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}Đọc lại từ Sheet
            </Button>
          </div>
        </DialogHeader>

        <div className="shrink-0 space-y-2 border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-10 pl-9" placeholder="Tìm nội dung, thiết bị, cương vị, số dòng…" value={search} onChange={event => setSearch(event.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Tổ máy" className="inline-flex rounded-lg border border-border bg-background p-0.5">
              {UNITS.map(item => <button key={item.value} type="button" role="radio" aria-checked={unit === item.value} onClick={() => setUnit(item.value)}
                className={cn("min-h-9 rounded-md px-3 text-xs font-semibold", unit === item.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{item.label}</button>)}
            </div>
            <button type="button" aria-pressed={onlyMismatch} onClick={() => setOnlyMismatch(value => !value)}
              className={cn("min-h-9 rounded-lg border px-3 text-xs font-semibold", onlyMismatch ? "border-amber-300 bg-amber-50 text-amber-900" : "border-border text-muted-foreground hover:bg-muted")}>
              Chỉ dòng lệch ({mismatchCount})
            </button>
            {canEdit && suggestable.length > 0 && <Button type="button" size="sm" className="ml-auto h-9 text-xs" disabled={write.isPending} onClick={applySuggestions}>
              Áp dụng gợi ý cho {suggestable.length} dòng
            </Button>}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {query.isError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{query.error.message}</p>
            : query.isLoading ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">Đang tải…</p>
            : refresh.isError && !rows.length ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{refresh.error.message}</p>
            : !filtered.length ? <p className="py-8 text-center text-sm text-muted-foreground">{refresh.isPending ? "Đang đọc Sheet…" : onlyMismatch ? "Không còn dòng nào lệch với kết quả SCCN." : "Không có dòng chưa số nào."}</p>
            : <ul className="space-y-2">{filtered.map(row => <UnnumberedRow key={row.id} row={row} canEdit={canEdit} busy={write.isPending}
              value={draft[row.id] ?? row.suggestedStatus ?? row.sheetStatus}
              onChange={status => setDraft(current => ({ ...current, [row.id]: status }))}
              onSave={status => void save([{ id: row.id, status }])} />)}</ul>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UnnumberedRow({ row, value, canEdit, busy, onChange, onSave }: {
  row: DefectUnnumberedItem; value: DefectUnnumberedStatus; canEdit: boolean; busy: boolean;
  onChange: (status: DefectUnnumberedStatus) => void; onSave: (status: DefectUnnumberedStatus) => void;
}) {
  const unchanged = value === row.sheetStatus && Boolean(row.sheetStatusRaw);
  return (
    <li className={cn("rounded-xl border bg-card px-3 py-3 sm:px-4", row.mismatch ? "border-amber-300" : "border-border")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Dòng {row.sourceRow}</span>
        <span>· {row.unitRaw || "—"}</span>
        {row.positionRaw && <span>· {row.positionRaw}</span>}
        {row.detectedAtRaw && <span>· {row.detectedAtRaw}</span>}
      </div>
      {row.deviceRaw && <p className="mt-1 text-sm font-semibold">{row.deviceRaw}</p>}
      <p className="mt-0.5 whitespace-pre-line text-sm leading-6">{row.content}</p>
      <div className="mt-2 grid gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs sm:grid-cols-2">
        <div className="min-w-0">
          <p className="font-semibold text-muted-foreground">Cột 14 · VH1</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5"><StatusPill status={row.sheetStatus} />{row.sheetStatusRaw ? <span className="truncate">{row.sheetStatusRaw}</span> : <span className="italic text-muted-foreground">trống</span>}</div>
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-muted-foreground">Kết quả thực hiện · SCCN</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">{row.suggestedStatus && <StatusPill status={row.suggestedStatus} />}<span className="whitespace-pre-line">{row.repairResultRaw || <span className="italic text-muted-foreground">trống</span>}</span></div>
        </div>
      </div>
      {canEdit && <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select value={value} onValueChange={next => onChange(next as DefectUnnumberedStatus)}>
          <SelectTrigger className="h-10 w-full sm:w-52" aria-label="Trạng thái ghi vào cột 14"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUS_ORDER.map(status => <SelectItem key={status} value={status}>{DEFECT_STATUS[status].label}</SelectItem>)}</SelectContent>
        </Select>
        <Button type="button" size="sm" className="h-10 flex-1 text-xs sm:flex-none" disabled={busy || unchanged} onClick={() => onSave(value)}>
          Ghi lên Sheet<ArrowRight />
        </Button>
        {row.updatedByName && <span className="text-[11px] text-muted-foreground">Sửa gần nhất: {row.updatedByName}</span>}
      </div>}
    </li>
  );
}
