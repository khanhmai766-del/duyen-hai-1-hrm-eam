"use client";

import Link from "next/link";
import { ChevronRight, RefreshCw, ScanLine, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { permitWorkHref } from "@/components/work-permits/contractor-work";
import { usePermitLiveSessions } from "@/hooks/useWorkPermits";
import { formatPermitNumber, PERMIT_UNITS } from "@/lib/work-permits";

const hhmm = (iso: string) => new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
function elapsed(from: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 60_000));
  return minutes < 60 ? `${minutes} phút` : `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
}

/**
 * Tab "Đang làm việc": mọi lần làm việc nhà thầu đang mở trên cả hai sổ, để trông nhiều nhà thầu cùng lúc
 * mà không mở từng phiếu. Bấm dòng / Quét / Kết thúc đều mở màn hình làm việc của phiếu đó
 * (`?scan=1`, `?end=1` tự bật đúng hộp) — mọi thao tác ghi chỉ có một nơi.
 */
export function PermitLiveBoard() {
  const query = usePermitLiveSessions();
  const rows = query.data?.data ?? [];
  const canExecute = Boolean(query.data?.meta?.canExecute);
  const people = rows.reduce((sum, row) => sum + 1 + row.inside, 0);

  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">{query.isPending ? "Đang tải…" : rows.length ? <><b className="text-foreground">{rows.length}</b> lần làm việc đang mở · <b className="text-emerald-700">{people}</b> người trong khu vực (kèm CHTT) · tự làm mới mỗi 15 giây</> : "Không có nhà thầu nào đang làm việc."}</p>
      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? "animate-spin" : undefined} />Làm mới</Button>
    </div>
    {query.isError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{query.error.message}</p>}
    <div className="space-y-2">
      {rows.map(row => {
        const href = permitWorkHref(row.permit.id);
        return <article key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-emerald-200 bg-card p-3 shadow-sm transition-colors hover:border-emerald-400 sm:p-4">
          <Link href={href} className="flex min-w-0 flex-1 basis-72 items-start gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <div className="w-16 shrink-0 rounded-lg bg-emerald-50 py-1.5 text-center dark:bg-emerald-950/30" title="Trong khu vực / tổng số người (kèm CHTT)">
              <p className="tabular-nums leading-7"><span className="text-2xl font-bold text-emerald-700">{1 + row.inside}</span><span className="text-xs font-semibold text-emerald-900/70 dark:text-emerald-200/70">/{1 + row.workers}</span></p>
              <p className="text-[10px] font-medium leading-3 text-emerald-900 dark:text-emerald-200">trong KV</p>
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-blue-700">PCT {formatPermitNumber(row.permit)}<span className="font-medium text-muted-foreground"> · {row.permit.kind === "ELECTRICAL" ? "Điện" : "Cơ"} · {PERMIT_UNITS[row.permit.unit]}</span></p>
              <p className="line-clamp-2 text-sm font-semibold leading-5">{row.permit.content || "—"}</p>
              <p className="truncate text-xs text-muted-foreground">{row.company} · CHTT <span className="font-medium text-foreground">{row.commanderName}</span>{row.permit.location ? ` · ${row.permit.location}` : ""}</p>
              <p className="text-xs text-muted-foreground">Từ {hhmm(row.openedAt)} · {elapsed(row.openedAt)}{row.waiting ? <span className="font-medium text-amber-700"> · {row.waiting} người chưa quét</span> : null}</p>
            </div>
          </Link>
          <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
            {canExecute && <>
              <Button asChild size="sm" className="h-10 flex-1 sm:h-9 sm:flex-none"><Link href={`${href}?scan=1`}><ScanLine />Quét</Link></Button>
              <Button asChild size="sm" variant="outline" className="h-10 flex-1 border-red-200 sm:h-9 sm:flex-none text-red-700 hover:bg-red-50 hover:text-red-800"><Link href={`${href}?end=1`}><Square />Kết thúc</Link></Button>
            </>}
            <Button asChild size="sm" variant="ghost" className="h-10 px-2 sm:h-9" aria-label={`Mở màn hình làm việc PCT ${formatPermitNumber(row.permit)}`}><Link href={href}><ChevronRight /></Link></Button>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
