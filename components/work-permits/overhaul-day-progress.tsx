"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronUp, ListChecks, Loader2, MonitorPlay, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { permitWorkHref } from "@/components/work-permits/contractor-work";
import { initialOverhaulDraft, OverhaulItemProgressEditor, overhaulDraftError, overhaulDraftPayload, type OverhaulProgressDraft } from "@/components/work-permits/overhaul-item-progress";
import { PermitDeadlineBadge } from "@/components/work-permits/permit-deadline";
import { useOverhaulProgressSave, useOverhaulToday, type OverhaulTodayRow } from "@/hooks/useWorkPermits";
import { normalizeText } from "@/lib/nav";
import { formatPermitNumber, PERMIT_KINDS } from "@/lib/work-permits";

const control = "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const hhmm = (iso: string) => new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
type Entry = { draft: OverhaulProgressDraft; note: string; open: boolean };

const touchedCount = (row: OverhaulTodayRow, entry: Entry | undefined) => entry ? row.permit.overhaulItems.filter(item => entry.draft[`${item.source}\u0000${item.sheet}\u0000${item.code}`]?.done).length : 0;

/**
 * "Tiến độ trong ngày": ghi tiến độ nhiều PCT đại tu một lượt thay vì mở từng màn hình làm việc. Mỗi phiếu đang có
 * lần làm việc mở là một thẻ (bung ra để tick hạng mục, % lũy kế, ghi chú). "Lưu" gửi TUẦN TỰ từng phiếu có tick qua
 * API lần làm việc của chính phiếu đó (action "progress") — phiếu lỗi giữ nguyên nhập liệu, phiếu xong được làm trống.
 */
export function OverhaulDayProgress() {
  const query = useOverhaulToday();
  const save = useOverhaulProgressSave();
  const qc = useQueryClient();
  const rows = useMemo(() => query.data?.data ?? [], [query.data]);
  const canExecute = Boolean(query.data?.meta?.canExecute);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const entryOf = (row: OverhaulTodayRow): Entry => entries[row.id] ?? { draft: initialOverhaulDraft(row.permit.overhaulItems, row.percents), note: "", open: false };
  const patch = (row: OverhaulTodayRow, change: Partial<Entry>) => setEntries(prev => ({ ...prev, [row.id]: { ...entryOf(row), ...change } }));
  const term = normalizeText(search.trim());
  const visible = rows.filter(row => !term || normalizeText(`${formatPermitNumber(row.permit)} ${row.permit.content} ${row.permit.teamName} ${row.commanderName} ${row.permit.overhaulItems.map(i => i.code).join(" ")}`).includes(term));
  const pending = rows.filter(row => touchedCount(row, entries[row.id]) > 0);
  const invalid = pending.map(row => ({ row, error: overhaulDraftError(row.permit.overhaulItems, entries[row.id].draft, row.percents, null) })).filter(x => x.error);

  async function saveAll() {
    if (invalid.length) { toast.error(`PCT ${formatPermitNumber(invalid[0].row.permit)}: ${invalid[0].error}`); return; }
    setSaving(true); setErrors({});
    const failed: Record<string, string> = {};
    let done = 0;
    // Tuần tự: mỗi phiếu khoá riêng trên server; lỗi một phiếu không chặn phiếu khác.
    for (const row of pending) {
      const entry = entries[row.id];
      try {
        await save.mutateAsync({ permitId: row.permit.id, body: { action: "progress", version: row.permit.version, sessionId: row.id, note: entry.note, itemProgress: overhaulDraftPayload(row.permit.overhaulItems, entry.draft) } });
        done++;
        setEntries(prev => { const next = { ...prev }; delete next[row.id]; return next; });
      } catch (error) {
        failed[row.id] = error instanceof Error ? error.message : "Không ghi được";
      }
    }
    setErrors(failed); setSaving(false);
    await qc.invalidateQueries({ queryKey: ["work-permits"] });
    await qc.invalidateQueries({ queryKey: ["work-permit"] });
    if (done) toast.success(`Đã cập nhật tiến độ ${done} phiếu; Sheet tiến độ đại tu được ghi sau ít giây`);
    if (Object.keys(failed).length) toast.error(`${Object.keys(failed).length} phiếu chưa lưu được — xem lý do ở từng phiếu`);
  }

  return <div className="mx-auto max-w-4xl space-y-4 pb-4">
    <header className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 px-2 text-xs"><Link href="/work-permits?tab=live"><ArrowLeft />Về sổ PCT</Link></Button>
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={query.isFetching || saving} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? "animate-spin" : undefined} />Làm mới</Button>
      </div>
      <div>
        <h1 className="text-lg font-bold sm:text-2xl">Tiến độ trong ngày</h1>
        <p className="hidden text-sm text-muted-foreground sm:block">Các PCT đại tu đang có lần làm việc mở. Bung từng phiếu, tick hạng mục đã làm, ghi % lũy kế và ghi chú, rồi bấm <b>Lưu</b> một lần cho mọi phiếu. Lần làm việc vẫn tiếp tục — kết thúc trên màn hình làm việc của phiếu.</p>
      </div>
      <input className={control} placeholder="Tìm số PCT, nội dung, nhà thầu, CHTT, mã hạng mục…" value={search} onChange={e => setSearch(e.target.value)} />
    </header>

    {query.isPending && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
    {query.isError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{query.error.message}</p>}
    {!query.isPending && !rows.length && <p className="rounded-lg bg-muted/40 p-6 text-center text-sm text-muted-foreground">Không có PCT đại tu nào đang có lần làm việc mở.</p>}
    {!query.isPending && rows.length > 0 && !visible.length && <p className="text-center text-sm text-muted-foreground">Không có phiếu khớp từ khoá.</p>}

    <div className="space-y-3">
      {visible.map(row => {
        const entry = entryOf(row);
        const ticked = touchedCount(row, entries[row.id]);
        const error = errors[row.id];
        return <section key={row.id} className={`rounded-xl border bg-card shadow-sm ${error ? "border-red-300" : ticked ? "border-violet-300" : "border-border"}`}>
          <button type="button" className="flex w-full items-start gap-3 p-3 text-left sm:p-4" onClick={() => patch(row, { open: !entry.open })} aria-expanded={entry.open}>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold">
                PCT {formatPermitNumber(row.permit)}
                <span className="text-xs font-medium text-muted-foreground">{PERMIT_KINDS[row.permit.kind]}{row.permit.position ? ` · ${row.permit.position}` : ""}</span>
                {ticked > 0 && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">Đã tick {ticked}</span>}
                <PermitDeadlineBadge permit={{ teamType: "CONTRACTOR", status: "ACTIVE", plannedEndAt: row.permit.plannedEndAt }} />
              </p>
              <p className="mt-0.5 line-clamp-2 text-sm">{row.permit.content}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">CHTT {row.commanderName} · {row.permit.teamName} · mở {hhmm(row.openedAt)} · {row.permit.overhaulItems.length} hạng mục</p>
            </div>
            {entry.open ? <ChevronUp className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" /> : <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />}
          </button>
          {error && <p role="alert" className="mx-3 mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-800 sm:mx-4">{error}</p>}
          {entry.open && <div className="space-y-3 border-t border-border p-3 sm:p-4">
            <OverhaulItemProgressEditor items={row.permit.overhaulItems} previous={row.percents} draft={entry.draft} onChange={draft => patch(row, { draft })} noneDone={false} onNoneDone={() => {}} updating scroll={false} />
            <label className="block space-y-1 text-sm"><span>Ghi chú làm việc (dùng cho hạng mục không ghi chú riêng)</span><textarea className={control} rows={2} maxLength={2000} value={entry.note} onChange={e => patch(row, { note: e.target.value })} /></label>
            <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs"><Link href={permitWorkHref(row.permit.id)}><MonitorPlay />Mở màn hình làm việc của phiếu</Link></Button>
          </div>}
        </section>;
      })}
    </div>

    {/* Dính đáy, nằm TRÊN thanh điều hướng đáy của điện thoại (cùng mốc với tab Đang làm việc). */}
    {canExecute && rows.length > 0 && <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 md:bottom-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-violet-200 bg-background/95 px-3 py-2.5 shadow-lg backdrop-blur dark:border-violet-900">
        <span className="min-w-0 text-sm"><ListChecks className="mr-1 inline h-4 w-4 text-violet-700" /><b>{pending.length}</b> phiếu đã tick</span>
        <Button type="button" className="h-11 shrink-0 whitespace-nowrap px-5" disabled={saving || !pending.length} onClick={saveAll}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}{saving ? "Đang lưu…" : pending.length ? `Lưu ${pending.length} phiếu` : "Lưu"}
        </Button>
      </div>
    </div>}
  </div>;
}
