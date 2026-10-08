"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ListChecks, RefreshCw, ScanLine, Search, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { permitWorkHref } from "@/components/work-permits/contractor-work";
import { usePermitLiveSessions } from "@/hooks/useWorkPermits";
import { normalizeText } from "@/lib/nav";
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
  const allRows = useMemo(() => query.data?.data ?? [], [query.data]);
  const canExecute = Boolean(query.data?.meta?.canExecute);
  // Lọc tại chỗ (dữ liệu bảng đã đủ): cương vị của phiếu + tìm theo số PCT / nội dung công việc, không phân biệt dấu.
  const [position, setPosition] = useState("");
  const [q, setQ] = useState("");
  const positions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const row of allRows) { const label = row.permit.position?.trim(); if (label && !byKey.has(normalizeText(label))) byKey.set(normalizeText(label), label); }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, "vi"));
  }, [allRows]);
  const term = normalizeText(q.trim());
  const rows = allRows.filter(row => (!position || normalizeText(row.permit.position ?? "") === normalizeText(position))
    && (!term || normalizeText(`${formatPermitNumber(row.permit)} ${row.permit.content ?? ""}`).includes(term)));
  const filtered = Boolean(position || term);

  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-1">
        <div className="relative min-w-0 flex-1 basis-56 sm:max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="search" aria-label="Tìm theo số PCT hoặc nội dung công việc" placeholder="Tìm số PCT, nội dung công việc…" value={q} onChange={e => setQ(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-base focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm" />
        </div>
        <select aria-label="Lọc theo cương vị" value={position} onChange={e => setPosition(e.target.value)}
          className="h-9 min-w-0 flex-1 basis-40 rounded-lg border border-input bg-background px-2 text-base focus:outline-none focus:ring-2 focus:ring-ring sm:max-w-[13rem] sm:flex-none sm:text-sm">
          <option value="">Tất cả cương vị</option>
          {positions.map(label => <option key={label} value={label}>{label}</option>)}
        </select>
        {filtered && <p className="text-xs text-muted-foreground">{rows.length}/{allRows.length} PCT · <button type="button" className="font-semibold text-blue-700" onClick={() => { setQ(""); setPosition(""); }}>Bỏ lọc</button></p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {/* Ghi tiến độ nhiều PCT đại tu một lượt (thay vì mở từng màn hình làm việc). */}
        <Button asChild size="sm" className="h-8 bg-violet-700 text-xs hover:bg-violet-800"><Link href="/work-permits/tien-do-ngay"><ListChecks />Tiến độ trong ngày</Link></Button>
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? "animate-spin" : undefined} />Làm mới</Button>
      </div>
    </div>
    {!query.isPending && !rows.length && <p className="text-sm text-muted-foreground">{allRows.length ? "Không có PCT nào khớp bộ lọc." : "Không có nhà thầu nào đang làm việc."}</p>}
    {query.isPending && <p className="text-sm text-muted-foreground">Đang tải…</p>}
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
