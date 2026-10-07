"use client";

import { useState } from "react";
import { History, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { usePermitActivity } from "@/hooks/useWorkPermits";
import { formatPermitNumber, isSessionCommander, type PermitDetailRow, type PermitSession } from "@/lib/work-permits";

const TZ = "Asia/Ho_Chi_Minh";
const day = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
/** Giờ trong ngày mở lần làm việc chỉ ghi HH:mm; sang ngày khác thì kèm ngày/tháng. */
const timeOn = (iso: string, base: string) => day(iso) === day(base) ? hhmm(iso) : new Date(iso).toLocaleString("vi-VN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

/**
 * Nút "Lịch sử vào/ra" trên popup phiếu: xem lại từng lần mở làm việc (ngày giờ cho phép, người cho phép, CHTT)
 * và các lượt vào/ra của từng nhân viên. Chỉ đọc — dữ liệu lấy từ `WorkPermitSession.members[].attendance`.
 */
export function SessionHistoryButton({ permit }: { permit: PermitDetailRow }) {
  const [open, setOpen] = useState(false);
  if (!permit._count.sessions) return null;
  return <>
    <Button type="button" variant="outline" className="shrink-0 bg-background" onClick={() => setOpen(true)}><History />Lịch sử vào/ra</Button>
    {open && <SessionHistoryDialog permit={permit} onClose={() => setOpen(false)} />}
  </>;
}

function SessionHistoryDialog({ permit, onClose }: { permit: PermitDetailRow; onClose: () => void }) {
  // Chi tiết phiếu chỉ kèm 2 lần mới nhất; các lần cũ hơn tải theo trang.
  const older = usePermitActivity<PermitSession>(permit.id, "sessions", permit.version, permit._count.sessions > permit.sessions.length);
  const sessions = [...permit.sessions, ...(older.data?.pages.flatMap(page => page.data) ?? [])];
  const total = permit._count.sessions;
  return <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
    <DialogContent className="max-w-2xl gap-3 p-4 sm:p-6">
      <DialogTitle className="pr-8">Lịch sử vào/ra · {formatPermitNumber(permit)}</DialogTitle>
      <DialogDescription>{total} lần làm việc, mới nhất ở trên. Giờ vào/ra lấy theo đồng hồ máy chủ.</DialogDescription>
      <div className="space-y-3">
        {sessions.map((s, i) => <SessionCard key={s.id} session={s} order={total - i} />)}
      </div>
      {older.isError && <p role="alert" className="text-sm text-red-700">{older.error.message}</p>}
      {older.isPending && permit._count.sessions > permit.sessions.length && <p className="text-sm text-muted-foreground">Đang tải các lần cũ hơn…</p>}
      {older.hasNextPage && <Button type="button" variant="outline" disabled={older.isFetching} onClick={() => void older.fetchNextPage()}>{older.isFetching ? "Đang tải…" : `Xem thêm (${Math.max(0, total - sessions.length)} lần còn lại)`}</Button>}
    </DialogContent>
  </Dialog>;
}

function SessionCard({ session: s, order }: { session: PermitSession; order: number }) {
  const workers = s.members.filter(m => !isSessionCommander(m, s));
  const live = !s.endedAt;
  return <section className={`overflow-hidden rounded-xl border ${live ? "border-emerald-300" : "border-border"}`}>
    <header className={`space-y-0.5 px-3 py-2.5 ${live ? "bg-emerald-50/70 dark:bg-emerald-950/20" : "bg-muted/40"}`}>
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
        <span>Lần {order} · {day(s.openedAt)}</span>
        <span className="font-normal tabular-nums text-muted-foreground">{hhmm(s.openedAt)} → {s.endedAt ? timeOn(s.endedAt, s.openedAt) : <b className="text-emerald-700">đang làm việc</b>}</span>
      </p>
      <p className="text-xs text-muted-foreground">Cho phép: <span className="text-foreground">{s.authorizerName || "—"}</span> · CHTT: <span className="text-foreground">{s.commanderName}</span> · {workers.length} nhân viên</p>
    </header>
    {workers.length === 0 ? <p className="px-3 py-2.5 text-sm text-muted-foreground">Không có nhân viên bổ sung (chỉ CHTT).</p>
      : <ol className="divide-y divide-border">{workers.map((m, i) => {
        const visits = m.attendance ?? [];
        return <li key={m.personId ?? `${i}-${m.name}`} className="flex gap-2.5 px-3 py-2">
          <span className="w-5 shrink-0 pt-px text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{m.name}{m.code ? <span className="font-normal text-muted-foreground"> · {m.code}</span> : null}</p>
            {visits.length ? <p className="mt-0.5 flex flex-wrap gap-1.5">{visits.map((v, k) => <span key={k} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-px text-xs tabular-nums">
              <LogIn size={12} className="text-emerald-600" aria-hidden />{timeOn(v.in, s.openedAt)} → {v.out ? timeOn(v.out, s.openedAt) : <b className="text-emerald-700">đang trong</b>}
            </span>)}</p>
              : <p className="mt-0.5 text-xs text-muted-foreground">Không ghi vào/ra</p>}
          </div>
        </li>;
      })}</ol>}
    {s.endedAt && (s.endConfirmedByName || s.endNote) && <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Xác nhận kết thúc: {s.endConfirmedByName || "—"}{s.endNote ? ` · ${s.endNote}` : ""}</p>}
  </section>;
}
