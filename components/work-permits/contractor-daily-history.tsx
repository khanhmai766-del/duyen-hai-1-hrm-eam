"use client";

import { useState } from "react";
import { ArrowLeft, ChevronDown, Download } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { participationRate } from "@/components/work-permits/contractor-dashboard";
import { useExportPermitDailyHistory, usePermitDailyHistory, usePermitDailyWorkers, type PermitCompanySummary } from "@/hooks/useWorkPermits";
import { permitWorkingDay } from "@/lib/work-permit-daily-people";
import { permitWorkingDayRange, shiftWorkingDay, workingDayLabel } from "@/lib/work-permit-daily-history";
import { PERMIT_CONTRACTOR_SCOPES, type PermitContractorScope } from "@/lib/work-permits";
import { cn } from "@/lib/utils";

const PRESETS = [7, 14, 30] as const;
const control = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-ring sm:h-9 sm:text-sm";
const pct = (value: number) => `${Math.round(value * 100)}%`;
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const oneDecimal = (value: number) => value.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

/** Màu ô theo tỷ lệ so với danh bạ (hoặc so với ngày cao nhất của đơn vị khi danh bạ trống) — 3 nấc nhạt, đủ để nhìn ra xu hướng. */
function shade(value: number, base: number) {
  if (!value) return "text-slate-300";
  const ratio = base > 0 ? value / base : 0;
  return ratio >= 0.75 ? "bg-blue-200/80 font-semibold text-blue-950" : ratio >= 0.45 ? "bg-blue-100 text-blue-900" : "bg-blue-50 text-blue-900";
}

/**
 * Lịch sử "Làm việc trong ngày" của nhóm nhà thầu đang chọn (Đại tu / SCTX / Đầu tư).
 *
 * Hai chế độ trong một hộp thoại:
 * - Tất cả đơn vị: biểu đồ tổng mỗi ngày + bảng đơn vị × ngày. Bấm tên đơn vị hoặc một ô để sang chế độ đơn vị.
 * - Một đơn vị: biểu đồ của đơn vị + danh sách ngày (mới nhất trên cùng); bấm một ngày để xem ai đã làm, ở PCT nào.
 *
 * Số liệu tính lại từ lượt vào/ra PCT (cùng quy tắc với cột "Làm việc trong ngày"), không phải bản chụp.
 * Tỷ lệ % so với danh bạ đang hoạt động HIỆN TẠI vì danh bạ không lưu lịch sử.
 */
export function DailyHistoryDialog({ scope, rows, initialCompany = "", onClose }: { scope: PermitContractorScope; rows: PermitCompanySummary[]; initialCompany?: string; onClose: () => void }) {
  const today = permitWorkingDay();
  const [from, setFrom] = useState(() => shiftWorkingDay(today, -13));
  const [to, setTo] = useState(today);
  const [company, setCompany] = useState(initialCompany);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const exporting = useExportPermitDailyHistory();
  let rangeError = "";
  try { permitWorkingDayRange(from, to); } catch (error) { rangeError = error instanceof Error ? error.message : "Khoảng ngày không hợp lệ"; }
  if (!rangeError && to > today) rangeError = "Chưa đến ngày kết thúc đã chọn";
  const history = usePermitDailyHistory(from, to, scope, !rangeError);
  const data = history.data?.data ?? [];
  const scopeLabel = PERMIT_CONTRACTOR_SCOPES[scope];
  const preset = to === today ? PRESETS.find(days => shiftWorkingDay(today, 1 - days) === from) : undefined;

  const info = new Map(rows.map(row => [row.company, row]));
  const codeOf = (name: string) => info.get(name)?.code || name;
  const sumOf = (name: string) => data.reduce((sum, entry) => sum + (entry.byCompany[name] ?? 0), 0);
  const worked = [...new Set(data.flatMap(entry => Object.keys(entry.byCompany)))].sort((a, b) => sumOf(b) - sumOf(a) || codeOf(a).localeCompare(codeOf(b), "vi"));
  const options = [...new Set([...rows.map(row => row.company), ...worked, ...(company ? [company] : [])])].sort((a, b) => codeOf(a).localeCompare(codeOf(b), "vi"));
  const active = company ? info.get(company)?.active ?? 0 : rows.reduce((sum, row) => sum + row.active, 0);
  const series = data.map(entry => ({ day: entry.day, value: company ? entry.byCompany[company] ?? 0 : entry.total }));
  const values = series.map(point => point.value);
  const peak = series.reduce<(typeof series)[number] | null>((best, point) => !best || point.value > best.value ? point : best, null);

  function pickPreset(days: number) { setTo(today); setFrom(shiftWorkingDay(today, 1 - days)); setOpenDay(null); }
  function focus(name: string, day: string | null = null) { setCompany(name); setOpenDay(day); }
  async function exportExcel() {
    try {
      const file = await exporting.mutateAsync({ from, to, scope });
      const url = URL.createObjectURL(file.blob), a = document.createElement("a");
      a.href = url; a.download = file.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể xuất lịch sử"); }
  }

  return <Dialog open onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent className="max-h-[92dvh] max-w-5xl grid-cols-[minmax(0,1fr)] gap-4 p-4 sm:p-6">
      <div className="pr-8">
        <DialogTitle>Lịch sử làm việc trong ngày · {scopeLabel}</DialogTitle>
        <DialogDescription className="mt-1">Số người đã làm việc mỗi ngày theo đơn vị — gồm CHTT, mỗi người chỉ tính một lần trên tất cả PCT, theo giờ Việt Nam.</DialogDescription>
      </div>

      {/* Bộ chọn: khoảng ngày nhanh, từ–đến, đơn vị, xuất Excel. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[auto_1fr_1fr] lg:grid-cols-[auto_9.5rem_9.5rem_minmax(0,1fr)_auto] lg:items-end">
        <div className="col-span-2 grid grid-cols-3 gap-1 self-end rounded-lg bg-muted p-1 sm:col-span-1" role="group" aria-label="Khoảng ngày nhanh">
          {PRESETS.map(days => <button key={days} type="button" aria-pressed={preset === days} onClick={() => pickPreset(days)}
            className={cn("h-8 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500", preset === days ? "bg-background text-blue-800 shadow-sm" : "text-muted-foreground hover:text-foreground")}>{days} ngày</button>)}
        </div>
        <label className="text-xs font-medium text-muted-foreground">Từ ngày<input type="date" className={cn(control, "mt-1")} value={from} max={to || today} onChange={e => { setFrom(e.target.value); setOpenDay(null); }} /></label>
        <label className="text-xs font-medium text-muted-foreground">Đến ngày<input type="date" className={cn(control, "mt-1")} value={to} min={from} max={today} onChange={e => { setTo(e.target.value); setOpenDay(null); }} /></label>
        <label className="col-span-2 text-xs font-medium text-muted-foreground lg:col-span-1">Đơn vị
          <select className={cn(control, "mt-1")} value={company} onChange={e => focus(e.target.value)}>
            <option value="">Tất cả đơn vị</option>
            {options.map(name => <option key={name} value={name} title={name}>{codeOf(name) === name ? name : `${codeOf(name)} — ${name}`}</option>)}
          </select>
        </label>
        <Button type="button" variant="outline" className="col-span-2 h-10 self-end sm:col-span-1 sm:h-9" disabled={Boolean(rangeError) || exporting.isPending} onClick={() => void exportExcel()} title="Bảng theo ngày của mọi đơn vị + chi tiết từng người"><Download />{exporting.isPending ? "Đang xuất…" : "Xuất Excel"}</Button>
      </div>

      {rangeError ? <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{rangeError}</p>
        : history.isPending ? <p role="status" className="py-10 text-center text-sm text-muted-foreground">Đang tính số người làm việc từng ngày…</p>
        : history.isError ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{history.error.message}</p>
        : <div className={cn("space-y-4 transition-opacity", history.isFetching && history.isPlaceholderData && "opacity-60")}>
          {company && <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button type="button" variant="ghost" size="sm" className="-ml-2 h-9 text-blue-800" onClick={() => focus("")}><ArrowLeft />Tất cả đơn vị</Button>
            <p className="min-w-0 text-sm"><b className="text-blue-800">{codeOf(company)}</b>{codeOf(company) !== company && <span className="text-muted-foreground"> · {company}</span>}</p>
          </div>}

          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
            <Stat label="Trung bình / ngày" value={oneDecimal(average(values))} note={active ? `${pct(participationRate(average(values), active))} danh bạ` : undefined} />
            <Stat label="Cao nhất" value={String(peak?.value ?? 0)} note={peak?.value ? workingDayLabel(peak.day).full : "không có"} />
            <Stat label="Số ngày làm việc" value={`${values.filter(Boolean).length}/${values.length}`} note={`danh bạ ${active}`} />
          </dl>

          <DailyChart series={series} active={active} today={today} selected={company ? openDay : null} onPick={company ? day => setOpenDay(openDay === day ? null : day) : undefined} />

          {company ? <CompanyDays company={company} scope={scope} series={series} active={active} today={today} openDay={openDay} onToggle={day => setOpenDay(openDay === day ? null : day)} />
            : !worked.length ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Không có ai làm việc trong khoảng ngày này.</p>
            : <CompanyMatrix days={data} companies={worked} info={info} codeOf={codeOf} today={today} onFocus={focus} />}

          <p className="text-xs text-muted-foreground">Tỷ lệ % so với số người đang hoạt động trong danh bạ hiện tại; đơn vị của mỗi người theo hồ sơ danh bạ hiện tại. Hôm nay tính đến thời điểm xem.</p>
        </div>}
    </DialogContent>
  </Dialog>;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="bg-card px-3 py-2.5 sm:px-4">
    <dt className="text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</dt>
    <dd className="mt-1 text-xl font-bold tabular-nums leading-none text-blue-800 sm:text-2xl">{value}</dd>
    {note && <dd className="mt-1 truncate text-[11px] text-muted-foreground">{note}</dd>}
  </div>;
}

function DailyChart({ series, active, today, selected, onPick }: { series: Array<{ day: string; value: number }>; active: number; today: string; selected: string | null; onPick?: (day: string) => void }) {
  const points = series.map(point => ({ ...point, label: workingDayLabel(point.day).short }));
  return <div className="h-44 rounded-xl border border-border px-1 pb-1 pt-3 sm:h-52" aria-label="Biểu đồ số người làm việc theo ngày">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#94A3B8" tickLine={false} interval="preserveStartEnd" minTickGap={6} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="#94A3B8" tickLine={false} axisLine={false} width={34} />
        <Tooltip cursor={{ fill: "#F1F5F9" }} content={({ active: shown, payload }) => {
          const point = shown ? payload?.[0]?.payload as (typeof points)[number] | undefined : undefined;
          if (!point) return null;
          const label = workingDayLabel(point.day);
          return <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md">
            <p className="font-semibold">{label.weekday}, {label.full}{point.day === today ? " · đến hiện tại" : ""}</p>
            <p className="mt-0.5"><b className="text-blue-800">{point.value}</b> người{active > 0 && <span className="text-muted-foreground"> · {pct(participationRate(point.value, active))} danh bạ</span>}</p>
          </div>;
        }} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} className={onPick ? "cursor-pointer" : undefined} onClick={onPick ? (point: { day?: string }) => { if (point.day) onPick(point.day); } : undefined}>
          {points.map(point => <Cell key={point.day} fill={point.day === selected ? "#1E3A8A" : point.day === today ? "#60A5FA" : "#2563EB"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

/** Bảng đơn vị × ngày (cột trái cố định khi cuộn ngang). Dòng cuối là tổng khử trùng của cả nhóm. */
function CompanyMatrix({ days, companies, info, codeOf, today, onFocus }: { days: Array<{ day: string; total: number; byCompany: Record<string, number> }>; companies: string[];
  info: Map<string, PermitCompanySummary>; codeOf: (name: string) => string; today: string; onFocus: (company: string, day?: string | null) => void }) {
  const head = "border-b border-r border-white/20 bg-[#00558F] px-1.5 py-2 text-center font-semibold text-white";
  const stick = "sticky left-0 z-10";
  return <div>
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-max min-w-full border-collapse text-xs tabular-nums">
        <thead><tr>
          <th scope="col" className={cn(head, stick, "z-20 min-w-24 text-left sm:min-w-40")}>Đơn vị</th>
          {days.map(entry => { const label = workingDayLabel(entry.day); return <th key={entry.day} scope="col" className={cn(head, "min-w-11 font-medium", entry.day === today && "bg-[#0B6BB0]")}>
            <span className={cn("block text-[10px] font-normal", label.weekend ? "text-amber-200" : "text-white/75")}>{entry.day === today ? "Hôm nay" : label.weekday}</span>{label.short}
          </th>; })}
          <th scope="col" className={cn(head, "min-w-12")} title="Trung bình mỗi ngày trong khoảng">TB</th>
          <th scope="col" className={cn(head, "min-w-12 border-r-0")}>Cao nhất</th>
        </tr></thead>
        <tbody>{companies.map(name => {
          const row = info.get(name);
          const values = days.map(entry => entry.byCompany[name] ?? 0);
          const base = row?.active || Math.max(...values);
          return <tr key={name} className="group">
            <th scope="row" className={cn(stick, "border-b border-r border-slate-100 bg-card p-0 text-left font-normal group-hover:bg-sky-50")}>
              <button type="button" onClick={() => onFocus(name)} title={`${name} — xem từng ngày`} className="block w-full max-w-28 truncate px-2 py-2 text-left font-semibold text-blue-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:max-w-48">
                {codeOf(name)}
              </button>
            </th>
            {days.map((entry, index) => <td key={entry.day} className="border-b border-r border-slate-100 p-0 text-center">
              {values[index] ? <button type="button" onClick={() => onFocus(name, entry.day)} title={`${codeOf(name)} · ${workingDayLabel(entry.day).full}: ${values[index]} người${row?.active ? ` (${pct(participationRate(values[index], row.active))})` : ""} — bấm để xem danh sách`}
                className={cn("block h-full w-full px-1.5 py-2 hover:ring-2 hover:ring-inset hover:ring-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600", shade(values[index], base))}>{values[index]}</button>
                : <span className="block px-1.5 py-2 text-slate-300">·</span>}
            </td>)}
            <td className="border-b border-r border-slate-100 px-1.5 py-2 text-center text-muted-foreground">{oneDecimal(average(values))}</td>
            <td className="border-b border-slate-100 px-1.5 py-2 text-center font-semibold">{Math.max(...values)}</td>
          </tr>;
        })}</tbody>
        <tfoot><tr className="bg-slate-50 font-semibold">
          <th scope="row" className={cn(stick, "border-r border-slate-200 bg-slate-50 px-2 py-2 text-left")} title="Mỗi người chỉ tính một lần trong ngày, kể cả khi làm cho hai đơn vị">Tổng</th>
          {days.map(entry => <td key={entry.day} className="border-r border-slate-200 px-1.5 py-2 text-center text-blue-900">{entry.total}</td>)}
          <td className="border-r border-slate-200 px-1.5 py-2 text-center">{oneDecimal(average(days.map(entry => entry.total)))}</td>
          <td className="px-1.5 py-2 text-center">{Math.max(...days.map(entry => entry.total))}</td>
        </tr></tfoot>
      </table>
    </div>
    <p className="mt-1.5 text-xs text-muted-foreground">Ô càng đậm, tỷ lệ so với danh bạ của đơn vị càng cao. Bấm tên đơn vị để xem từng ngày, bấm một ô để xem ai đã làm. Dòng Tổng tính mỗi người một lần nên có thể nhỏ hơn cộng các ô.</p>
  </div>;
}

/** Chế độ một đơn vị: mỗi ngày một dòng (mới nhất trên cùng), bấm để bung danh sách người đã làm. */
function CompanyDays({ company, scope, series, active, today, openDay, onToggle }: { company: string; scope: PermitContractorScope; series: Array<{ day: string; value: number }>;
  active: number; today: string; openDay: string | null; onToggle: (day: string) => void }) {
  const max = Math.max(1, active, ...series.map(point => point.value));
  return <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border">{[...series].reverse().map(point => {
    const label = workingDayLabel(point.day);
    const open = openDay === point.day && point.value > 0;
    return <li key={point.day} className={open ? "bg-sky-50/60" : undefined}>
      <button type="button" disabled={!point.value} aria-expanded={point.value ? open : undefined} onClick={() => onToggle(point.day)}
        className="grid min-h-12 w-full grid-cols-[4.75rem_minmax(0,1fr)_auto_1.25rem] items-center gap-3 px-3 py-2 text-left enabled:hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:cursor-default">
        <span className="leading-tight"><span className={cn("block text-[11px]", label.weekend ? "text-amber-700" : "text-muted-foreground")}>{point.day === today ? "Hôm nay" : label.weekday}</span><span className="text-sm font-semibold tabular-nums">{label.short}</span></span>
        <span className="h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, point.value / max * 100)}%` }} /></span>
        <span className="whitespace-nowrap text-right text-sm tabular-nums">{point.value ? <><b className="text-blue-800">{point.value}</b>{active > 0 && <span className="text-xs text-muted-foreground"> · {pct(participationRate(point.value, active))}</span>}</> : <span className="text-slate-400">0</span>}</span>
        {point.value ? <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} /> : <span />}
      </button>
      {open && <DayWorkers day={point.day} company={company} scope={scope} />}
    </li>;
  })}</ol>;
}

function DayWorkers({ day, company, scope }: { day: string; company: string; scope: PermitContractorScope }) {
  const workers = usePermitDailyWorkers(day, company, scope, true);
  if (workers.isPending) return <p role="status" className="px-3 pb-3 text-sm text-muted-foreground">Đang tải danh sách…</p>;
  if (workers.isError) return <p role="alert" className="px-3 pb-3 text-sm text-red-700">{workers.error.message}</p>;
  const list = workers.data.data;
  const commanders = list.filter(worker => worker.commander).length;
  return <div className="px-3 pb-3">
    <p className="mb-1.5 text-xs text-muted-foreground">{list.length} người · {commanders} CHTT · {list.length - commanders} nhân viên</p>
    <ol className="grid grid-cols-[minmax(0,1fr)] gap-x-6 sm:grid-cols-2">{list.map((worker, index) => <li key={`${worker.code}-${worker.name}-${index}`} className="flex gap-2 border-t border-sky-100 py-1.5 text-sm">
      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{worker.name}{worker.code && <span className="font-normal text-muted-foreground"> · {worker.code}</span>}{worker.commander && <span className="ml-1.5 rounded bg-emerald-50 px-1 py-px text-[10px] font-bold text-emerald-700">CHTT</span>}</span>
        {worker.permits.length > 0 && <span className="block truncate text-xs text-muted-foreground" title={worker.permits.join(", ")}>PCT {worker.permits.join(", ")}</span>}
      </span>
    </li>)}</ol>
  </div>;
}
