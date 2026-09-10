"use client";
import { useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermitActivity, usePermitHistoryDetail } from "@/hooks/useWorkPermits";
import { PERMIT_FIELD_LABELS, permitValue, type PermitHistorySummary, type PermitDetailRow } from "@/lib/work-permits";

function HistoryEntry({ permitId, entry }: { permitId: string; entry: PermitHistorySummary }) {
  const [open, setOpen] = useState(false);
  const query = usePermitHistoryDetail(permitId, entry.id, open);
  const detail = query.data?.data;
  return <details className="rounded-lg border border-border p-3" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer text-sm"><b>{entry.action}</b> · {entry.actorName}<span className="mt-1 block text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</span></summary>
    {open && (query.isError ? <p role="alert">{query.error.message}<Button type="button" variant="ghost" onClick={() => query.refetch()}>Thử lại</Button></p> : !detail ? <p role="status" className="mt-3 text-sm">Đang tải nội dung cập nhật…</p> : <dl className="mt-3 space-y-2">{Object.entries(PERMIT_FIELD_LABELS).filter(([key]) => JSON.stringify(detail.before?.[key] ?? null) !== JSON.stringify(detail.after[key] ?? null)).map(([key, label]) => <div key={key} className="text-xs"><dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap break-words text-muted-foreground">{detail.before ? `${permitValue(key, detail.before[key])} → ` : ""}{permitValue(key, detail.after[key])}</dd></div>)}</dl>)}
  </details>;
}
export function PermitHistoryPanel({ permit }: { permit: PermitDetailRow }) {
  const [expanded, setExpanded] = useState(false);
  const query = usePermitActivity<PermitHistorySummary>(permit.id, "history", permit.version, expanded);
  const entries = [...permit.history, ...(expanded ? query.data?.pages.flatMap(page => page.data) ?? [] : [])];
  return <section className="space-y-3"><h3 className="flex items-center gap-2 font-semibold"><Clock size={16} />Lịch sử cập nhật</h3>
    {entries.map(entry => <HistoryEntry key={entry.id} permitId={permit.id} entry={entry} />)}
    {query.isError && expanded && <p role="alert" className="text-sm text-red-700">{query.error.message}</p>}
    {permit._count.history > 2 && <div className="flex flex-wrap gap-2">
      {(!expanded || query.hasNextPage || query.isPending || query.isError) && <Button type="button" variant="outline" disabled={expanded && query.isFetching} onClick={() => { if (!expanded) setExpanded(true); else if (query.isError) query.refetch(); else query.fetchNextPage(); }}>{expanded && query.isFetching ? "Đang tải…" : query.isError && expanded ? "Thử lại" : `Xem thêm cập nhật (${Math.max(0, permit._count.history - entries.length)} còn lại)`}</Button>}
      {expanded && <Button type="button" variant="ghost" onClick={() => setExpanded(false)}>Thu gọn — 2 cập nhật gần nhất</Button>}
    </div>}
  </section>;
}
