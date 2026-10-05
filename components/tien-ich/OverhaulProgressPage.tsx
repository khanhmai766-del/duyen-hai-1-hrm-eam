"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOverhaulProgress, useOverhaulProgressCell, useOverhaulProgressTabs } from "@/hooks/useOverhaulProgress";
import { normalizeText } from "@/lib/nav";
import { OVERHAUL_DAY_COUNT, overhaulDayDate } from "@/lib/overhaul-milestones-source";
import { vietnamDate } from "@/lib/overhaul-milestones";
import { overhaulKpis, type OverhaulGridRow } from "@/lib/overhaul-progress-grid";
import { OVERHAUL_DAY_STATUSES } from "@/lib/work-permit-overhaul";
import { cn } from "@/lib/utils";

/** Cùng bộ màu với ô trạng thái trên 4 file Sheet (lib/server/overhaul-sheet-writer.ts STATUS_COLORS). */
const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  [OVERHAUL_DAY_STATUSES.NOT_STARTED]: { background: "#e2e8f0", color: "#334155" },
  [OVERHAUL_DAY_STATUSES.IN_PROGRESS]: { background: "#bfdbfe", color: "#1e3a8a" },
  [OVERHAUL_DAY_STATUSES.SKIPPED]: { background: "#fde68a", color: "#78350f" },
  [OVERHAUL_DAY_STATUSES.NOT_OPENED]: { background: "#fecaca", color: "#991b1b" },
  [OVERHAUL_DAY_STATUSES.CLOSED]: { background: "#bbf7d0", color: "#14532d" },
};
const DAYS = Array.from({ length: OVERHAUL_DAY_COUNT }, (_, i) => ({ n: i + 1, date: overhaulDayDate(i + 1) }));
const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const STORE_KEY = "overhaul-progress:tab";
const DAY_WIDTH = 124;
/** Cửa sổ ngày mặc định: dữ liệu tải về và số ô phải vẽ chỉ phụ thuộc số ngày đang xem, không phình theo nhật ký. */
const WINDOW = 7;
/** Cột Nội dung cố định: hẹp trên điện thoại để còn chỗ cho cột ngày. */
const CONTENT_WIDTH = "w-36 min-w-36 max-w-36 sm:w-72 sm:min-w-72 sm:max-w-72";
/** Chiều cao ước lượng một hạng mục (2 hàng) — bảng chỉ vẽ các hạng mục đang nằm trong màn hình. */
const ROW_ESTIMATE = 112;

type Opened = { row: OverhaulGridRow; n: number; date: string };
const noopSubscribe = () => () => {};

export default function OverhaulProgressPage() {
  const tabsQuery = useOverhaulProgressTabs();
  const tabs = useMemo(() => tabsQuery.data?.data ?? [], [tabsQuery.data]);
  const [picked, setPicked] = useState<{ source: string; sheet: string } | null>(null);
  const [search, setSearch] = useState("");
  const [onlyPermit, setOnlyPermit] = useState(false);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [allDays, setAllDays] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // "Hôm nay" chỉ tính ở trình duyệt (máy chủ trả null) — tránh lệch hydrate quanh nửa đêm / đồng hồ máy chủ khác máy.
  const today = useSyncExternalStore(noopSubscribe, () => vietnamDate(), () => null);

  // Tab đang xem: tab vừa chọn → tab lần trước (nhớ trong trình duyệt, nếu còn) → tab đầu tiên.
  const current = useMemo(() => {
    const exists = (value: { source?: string; sheet?: string } | null) => tabs.find(tab => tab.source === value?.source && tab.sheet === value?.sheet);
    let saved: { source?: string; sheet?: string } | null = null;
    if (!picked && tabs.length) try { saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null"); } catch { /* bộ nhớ trình duyệt bị chặn */ }
    return exists(picked) ?? exists(saved) ?? tabs[0] ?? null;
  }, [tabs, picked]);
  const source = current?.source ?? "", sheet = current?.sheet ?? "";
  function choose(nextSource: string, nextSheet: string) {
    setPicked({ source: nextSource, sheet: nextSheet });
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ source: nextSource, sheet: nextSheet })); } catch { /* bỏ qua */ }
  }

  // Cửa sổ ngày: mặc định 7 ngày có hôm nay ở giữa (trước đợt → tuần đầu, sau đợt → tuần cuối).
  const todayIndex = DAYS.findIndex(day => day.date === today);
  const defaultStart = todayIndex >= 0 ? Math.min(Math.max(todayIndex - 3, 0), OVERHAUL_DAY_COUNT - WINDOW) : today && today > DAYS[OVERHAUL_DAY_COUNT - 1].date ? OVERHAUL_DAY_COUNT - WINDOW : 0;
  const first = start ?? defaultStart;
  const visibleDays = allDays ? DAYS : DAYS.slice(first, first + WINDOW);
  const from = visibleDays[0].date, to = visibleDays[visibleDays.length - 1].date;
  const shift = (step: number) => setStart(Math.min(Math.max(first + step, 0), OVERHAUL_DAY_COUNT - WINDOW));

  // Chờ biết "hôm nay" mới tải, để không tải nhầm cửa sổ tuần đầu rồi tải lại.
  const grid = useOverhaulProgress(today ? source : "", sheet, from, to);
  const rows = useMemo(() => {
    const term = normalizeText(search.trim());
    return (grid.data?.data ?? []).filter(row => (!onlyPermit || row.hasPermit)
      && (!term || normalizeText(`${row.code} ${row.device} ${row.content}`).includes(term)));
  }, [grid.data, search, onlyPermit]);

  // Chỉ vẽ các hạng mục đang hiện trong khung cuộn (tab Trực phụ điện ~455 hạng mục).
  // TanStack Virtual trả về hàm không memo được — React Compiler bỏ qua component này (dự án không bật compiler).
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_ESTIMATE, overscan: 6 });
  const virtualRows = virtualizer.getVirtualItems();
  const padTop = virtualRows[0]?.start ?? 0;
  const padBottom = virtualRows.length ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0;

  // Mở bảng / đổi tab / đổi cửa sổ: cuộn ngang tới cột hôm nay (nếu đang xem).
  const hasData = Boolean(grid.data);
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || !hasData) return;
    const th = box.querySelector<HTMLElement>(`[data-day="${today}"]`);
    const sticky = box.querySelector<HTMLElement>("[data-sticky-end]");
    const stickyEnd = sticky ? sticky.offsetLeft + sticky.offsetWidth : 0;
    // Màn rộng: chừa một ngày trước hôm nay để đối chiếu; điện thoại: hôm nay là cột đầu tiên nhìn thấy.
    const lead = box.clientWidth - stickyEnd >= 3 * DAY_WIDTH ? DAY_WIDTH : 0;
    box.scrollLeft = th ? Math.max(0, th.offsetLeft - stickyEnd - lead) : 0;
  }, [hasData, sheet, today, from, to]);

  const sources = [...new Map(tabs.map(tab => [tab.source, tab.sourceLabel])).entries()];
  const sheetTabs = tabs.filter(tab => tab.source === source);
  const withPermit = (grid.data?.data ?? []).filter(row => row.hasPermit).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Tiến độ đại tu S2-DH1" mobileTitle="Tiến độ đại tu"
        description="Bảng như 4 file Sheet tiến độ: trạng thái từng ngày và nhật ký ngày của từng hạng mục. Chỉ xem." hideDescriptionOnMobile />

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center 2xl:flex-nowrap">
        <Select value={source} onValueChange={value => { const firstTab = tabs.find(tab => tab.source === value); if (firstTab) choose(value, firstTab.sheet); }}>
          <SelectTrigger className="h-10 sm:w-40" aria-label="File tiến độ"><SelectValue placeholder="File" /></SelectTrigger>
          <SelectContent>{sources.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sheet} onValueChange={value => choose(source, value)}>
          <SelectTrigger className="h-10 sm:w-56" aria-label="Tab"><SelectValue placeholder="Tab" /></SelectTrigger>
          <SelectContent>{sheetTabs.map(tab => <SelectItem key={tab.sheet} value={tab.sheet}>{tab.sheet} · {tab.items}</SelectItem>)}</SelectContent>
        </Select>
        <label className="relative col-span-2 sm:w-56 2xl:w-auto 2xl:min-w-40 2xl:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm mã, thiết bị, nội dung" className="h-10 pl-9" />
        </label>
        <label className="col-span-2 inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap text-sm">
          <input type="checkbox" checked={onlyPermit} onChange={event => setOnlyPermit(event.target.checked)} className="h-4 w-4 accent-sky-700" />
          Chỉ hạng mục có PCT{grid.data ? ` (${withPermit})` : ""}
        </label>
        {/* Cửa sổ ngày + tải lại — cùng hàng bộ lọc, sát phải trên máy tính */}
        <div className="col-span-2 flex shrink-0 items-center gap-2 sm:ml-auto">
        {!allDays && <>
          <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => shift(-WINDOW)} disabled={first === 0} aria-label="7 ngày trước"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-center text-sm font-semibold tabular-nums sm:min-w-36">
            <span className="hidden sm:inline">Ngày {visibleDays[0].n}–{visibleDays[visibleDays.length - 1].n} · </span>{ddmm(from)}–{ddmm(to)}
          </span>
          <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => shift(WINDOW)} disabled={first >= OVERHAUL_DAY_COUNT - WINDOW} aria-label="7 ngày sau"><ChevronRight className="h-4 w-4" /></Button>
          {first !== defaultStart && <Button variant="ghost" className="h-10" onClick={() => setStart(null)}>Hôm nay</Button>}
        </>}
        <Button variant="outline" className="hidden h-10 gap-1.5 sm:inline-flex" onClick={() => setAllDays(value => !value)}
          title={allDays ? "Quay lại xem 7 ngày" : "Xem cả 60 ngày"}>
          <CalendarDays className="h-4 w-4" />{allDays ? "7 ngày" : "60 ngày"}
        </Button>
        <Button variant="ghost" size="icon" className="ml-auto h-10 w-10 sm:ml-0" onClick={() => grid.refetch()} disabled={grid.isFetching} aria-label="Tải lại" title="Tải lại">
          <RefreshCw className={cn("h-4 w-4", grid.isFetching && "animate-spin")} />
        </Button>
        </div>
      </div>

      {grid.data && <KpiCards rows={grid.data.data} tabLabel={sheet} />}

      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {Object.entries(STATUS_STYLE).map(([label, style]) => <span key={label} className="rounded px-2 py-1 font-semibold" style={style}>{label}</span>)}
      </div>

      {(tabsQuery.isPending || grid.isPending && Boolean(sheet)) && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      {(tabsQuery.isError || grid.isError) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{(tabsQuery.error ?? grid.error)?.message}</p>}
      {tabsQuery.data && !tabs.length && <p className="py-10 text-center text-sm text-muted-foreground">Chưa có hạng mục nào — bấm “Đồng bộ hạng mục” ở mục Tiến độ đại tu của sổ PCT.</p>}

      {grid.data && (
        <div ref={scrollRef} className={cn("max-h-[calc(100dvh-15rem)] overflow-auto rounded-xl border border-border bg-white transition-opacity", grid.isPlaceholderData && "opacity-60")}>
          {/* w-full: cột ngày giãn ra lấp kín khung khi xem 7 ngày (cột Mã / Nội dung đã khoá độ rộng). */}
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-100 text-slate-700">
                <th className="sticky left-0 z-30 w-16 min-w-16 max-w-16 border-b border-r border-border bg-slate-100 px-2 py-2 text-left">Mã</th>
                <th data-sticky-end className={cn("sticky left-16 z-30 border-b border-r border-border bg-slate-100 px-2 py-2 text-left", CONTENT_WIDTH)}>
                  Nội dung<span className="block text-[11px] font-normal">% · Trạng thái hiện tại</span>
                </th>
                {visibleDays.map(day => (
                  <th key={day.n} data-day={day.date} style={{ minWidth: DAY_WIDTH, width: DAY_WIDTH }}
                    className={cn("border-b border-r border-border px-1 py-1.5 font-semibold", day.date === today && "bg-amber-200 text-amber-950")}>
                    Ngày {day.n}<span className="block text-[11px] font-normal">{ddmm(day.date)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            {padTop > 0 && <tbody aria-hidden><tr><td colSpan={2 + visibleDays.length} style={{ height: padTop }} /></tr></tbody>}
            {virtualRows.map(virtual => {
              const row = rows[virtual.index];
              const band = virtual.index % 2 ? "bg-slate-50" : "bg-white";
              return (
                <tbody key={row.code} data-index={virtual.index} ref={virtualizer.measureElement}>
                  <tr>
                    <td rowSpan={2} className={cn("sticky left-0 z-10 w-16 min-w-16 max-w-16 break-words border-b border-r border-border px-2 py-1.5 align-middle font-semibold", band)}>{row.code}</td>
                    <td rowSpan={2} className={cn("sticky left-16 z-10 border-b border-r border-border px-2 py-1.5 align-middle", CONTENT_WIDTH, band)}>
                      <span className="line-clamp-3">{row.content || row.device}</span>
                      {row.device && row.content && <span className="mt-0.5 hidden truncate text-[11px] text-muted-foreground sm:block">{row.device}</span>}
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="font-semibold tabular-nums">{row.percent === null ? "—" : `${row.percent}%`}</span>
                        <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold leading-tight" style={STATUS_STYLE[row.status]}>{row.status}</span>
                      </span>
                    </td>
                    {visibleDays.map(day => {
                      const cell = row.days[day.date];
                      return (
                        <td key={day.n} className={cn("border-r border-border/70 p-0.5", day.date === today && "bg-amber-50")}>
                          {cell && <button type="button" onClick={() => setOpened({ row, n: day.n, date: day.date })}
                            className="block min-h-8 w-full rounded px-1 text-[11px] font-semibold leading-tight" style={STATUS_STYLE[cell.status]}>{cell.status}</button>}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    {visibleDays.map(day => {
                      const journal = row.days[day.date]?.journal;
                      return (
                        <td key={day.n} className={cn("border-b border-r border-border px-1 py-1 align-top", day.date === today ? "bg-amber-50" : band)}>
                          {journal && <button type="button" onClick={() => setOpened({ row, n: day.n, date: day.date })}
                            className="line-clamp-4 w-full whitespace-pre-line text-left text-[11px] leading-snug text-slate-700 hover:text-sky-800">{journal}</button>}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              );
            })}
            {padBottom > 0 && <tbody aria-hidden><tr><td colSpan={2 + visibleDays.length} style={{ height: padBottom }} /></tr></tbody>}
            {!rows.length && <tbody><tr><td colSpan={2 + visibleDays.length} className="px-4 py-10 text-left text-sm text-muted-foreground">Không có hạng mục khớp bộ lọc.</td></tr></tbody>}
          </table>
        </div>
      )}
      {grid.data && <p className="text-xs text-muted-foreground">Kết quả ngày cập nhật khi PCT kết thúc lần làm việc / cập nhật tiến độ (giống ghi lên Sheet); bảng tự làm mới mỗi 3 phút. Danh sách hạng mục đồng bộ từ Sheet{grid.data.meta.syncedAt ? ` lúc ${new Date(grid.data.meta.syncedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : ""}.</p>}

      <CellDialog source={source} sheet={sheet} opened={opened} onClose={() => setOpened(null)} />
    </div>
  );
}

/** 4 thẻ tổng hợp — cùng công thức với hàng tổng hợp đầu tab trên Sheet (overhaulKpis). Tính trên cả tab, không theo bộ lọc. */
function KpiCards({ rows, tabLabel }: { rows: OverhaulGridRow[]; tabLabel: string }) {
  const kpi = overhaulKpis(rows);
  const cards = [
    { label: "Tổng số hạng mục", value: kpi.total.toLocaleString("vi-VN"), note: tabLabel, color: "text-amber-900" },
    { label: "Đã hoàn thành", value: kpi.done.toLocaleString("vi-VN"), note: "Hạng mục xong", color: "text-emerald-700" },
    { label: "Đang thực hiện", value: kpi.inProgress.toLocaleString("vi-VN"), note: "Đang xử lý", color: "text-orange-700" },
    { label: "% Tiến độ", value: `${kpi.progress.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`, note: "Tiến độ chung", color: "text-sky-700" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cards.map(card => (
        <div key={card.label} className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-1.5 text-center sm:py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900/80">{card.label}</p>
          <p className={cn("text-xl font-bold tabular-nums sm:mt-0.5 sm:text-2xl", card.color)}>{card.value}</p>
          <p className="truncate text-[11px] italic text-muted-foreground">{card.note}</p>
        </div>
      ))}
    </div>
  );
}

/** Nhật ký một ô: bảng chỉ có bản rút gọn — ô bị cắt thì tải bản đầy đủ khi mở. */
function CellDialog({ source, sheet, opened, onClose }: { source: string; sheet: string; opened: Opened | null; onClose: () => void }) {
  const preview = opened ? opened.row.days[opened.date] : undefined;
  const full = useOverhaulProgressCell(source, sheet, opened?.row.code ?? "", opened?.date ?? "", Boolean(opened && preview?.more));
  const cell = preview?.more ? full.data ?? preview : preview;
  return (
    <Dialog open={Boolean(opened)} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        {opened && <>
          <DialogHeader className="pr-8">
            <DialogTitle>{opened.row.code} · Ngày {opened.n} ({ddmm(opened.date)})</DialogTitle>
            <DialogDescription>{opened.row.content || opened.row.device}</DialogDescription>
          </DialogHeader>
          {cell && <span className="inline-block w-fit rounded px-2 py-1 text-xs font-semibold" style={STATUS_STYLE[cell.status]}>{cell.status}</span>}
          <div className="max-h-[60dvh] overflow-y-auto whitespace-pre-line rounded-lg border border-border bg-slate-50 p-3 text-sm leading-relaxed">
            {cell?.journal || "Không có nhật ký ngày này."}
            {preview?.more && full.isFetching && <Loader2 className="ml-1 inline h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {preview?.more && full.isError && <span className="mt-2 block text-xs text-red-700">Không tải được nhật ký đầy đủ: {full.error.message}</span>}
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}
