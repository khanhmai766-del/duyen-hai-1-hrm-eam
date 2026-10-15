"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUpdateMilestoneActual } from "@/hooks/useOverhaulMilestones";
import { milestoneDateLabel, type OverhaulMilestone } from "@/lib/overhaul-milestones";
import { isRangeMilestone, type CampaignProgress, type MilestoneProgressLog, type MilestoneStatus, type MilestoneTone, type SCurvePoint } from "@/lib/overhaul-milestone-progress";
import { cn } from "@/lib/utils";

export const pct = (value: number) => `${value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const shortDate = (date: string) => `${date.slice(8)}/${date.slice(5, 7)}`;

export const TONE_DOT: Record<MilestoneTone, string> = { good: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500", idle: "bg-slate-300" };
const TONE_CHIP: Record<MilestoneTone, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-800", warn: "border-amber-200 bg-amber-50 text-amber-900",
  bad: "border-red-200 bg-red-50 text-red-800", idle: "border-slate-200 bg-slate-50 text-slate-600",
};

export function StatusChip({ status }: { status: MilestoneStatus }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold", TONE_CHIP[status.tone])}>
    <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[status.tone])} />{status.label}
  </span>;
}

/** Dải tiến độ toàn đợt dưới tiêu đề thẻ: % thực tế (thanh) so với % kế hoạch (vạch). */
export function ProgressStrip({ progress, onOpen }: { progress: CampaignProgress; onOpen: () => void }) {
  const tone: MilestoneTone = progress.deviation >= -1 ? "good" : progress.deviation > -10 ? "warn" : "bad";
  const gap = progress.deviation >= 0 ? `Vượt ${pct(progress.deviation)}` : `Chậm ${pct(-progress.deviation)}`;
  return <button type="button" onClick={onOpen} aria-label={`Tiến độ thực hiện ${pct(progress.actual)}, kế hoạch ${pct(progress.planned)}. Bấm xem biểu đồ đường S`}
    className="relative flex w-full flex-col gap-2 border-b border-slate-100 bg-white/80 px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600 sm:flex-row sm:items-center sm:gap-5 sm:px-5">
    <span className="flex shrink-0 items-baseline gap-2 whitespace-nowrap">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Thực hiện</span>
      <span className="text-2xl font-bold tabular-nums leading-none text-navy">{pct(progress.actual)}</span>
      <span className="text-sm text-slate-500">/ KH {pct(progress.planned)}</span>
    </span>
    <span className="relative block h-2.5 w-full rounded-full bg-slate-100 sm:w-auto sm:min-w-0 sm:flex-1">
      <span className="absolute inset-y-0 left-0 rounded-full bg-sky-600" style={{ width: `${Math.min(100, progress.actual)}%` }} />
      <span className="absolute -inset-y-1 w-0.5 rounded bg-slate-700" style={{ left: `calc(${Math.min(100, progress.planned)}% - 1px)` }} title={`Kế hoạch ${pct(progress.planned)}`} />
    </span>
    <span className="flex shrink-0 flex-wrap items-center gap-2 whitespace-nowrap text-xs">
      <span className={cn("rounded-md border px-2 py-0.5 font-semibold", TONE_CHIP[tone])}>{gap}</span>
      {progress.overdue > 0 && <span className="font-semibold text-red-700">{progress.overdue} quá hạn</span>}
      {progress.behind > 0 && <span className="font-semibold text-amber-800">{progress.behind} chậm</span>}
      {progress.spi !== null && <span className="text-slate-500" title="Chỉ số tiến độ = thực tế / kế hoạch">SPI {progress.spi.toLocaleString("vi-VN")}</span>}
    </span>
  </button>;
}

/** Đường S kế hoạch / thực tế theo ngày đại tu 1…60 — SVG tự vẽ, không dùng thư viện biểu đồ. */
export function SCurveChart({ points, today }: { points: SCurvePoint[]; today: string }) {
  const W = 520, H = 270, L = 40, R = 30, T = 14, B = 46;
  const x = (day: number) => L + (day - 1) / Math.max(1, points.length - 1) * (W - L - R);
  const y = (value: number) => T + (1 - value / 100) * (H - T - B);
  const path = (values: Array<[number, number]>) => values.map(([d, v], i) => `${i ? "L" : "M"}${x(d).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const plan = path(points.map(p => [p.day, p.planned]));
  const actualPoints = points.filter(p => p.actual !== null);
  const actual = path(actualPoints.map(p => [p.day, p.actual!]));
  const todayPoint = points.find(p => p.date === today);
  const last = actualPoints.at(-1);
  return <figure className="space-y-2">
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Biểu đồ đường S tiến độ kế hoạch và thực tế">
      {[0, 25, 50, 75, 100].map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-slate-100" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="12" className="fill-slate-500">{v}%</text></g>)}
      {points.filter(p => p.day === 1 || p.day % 10 === 0).map(p => <text key={p.day} x={x(p.day)} y={H - 26} textAnchor="middle" fontSize="12" className="fill-slate-500"><tspan x={x(p.day)} fontWeight="600">N{p.day}</tspan><tspan x={x(p.day)} dy="15">{shortDate(p.date)}</tspan></text>)}
      {todayPoint && <g><line x1={x(todayPoint.day)} x2={x(todayPoint.day)} y1={T} y2={H - B} className="stroke-amber-400" strokeDasharray="4 3" /><text x={x(todayPoint.day) + 4} y={T + 12} fontSize="12" fontWeight="600" className="fill-amber-700">Hôm nay</text></g>}
      <path d={plan} fill="none" className="stroke-slate-400" strokeWidth={2} strokeDasharray="6 4" />
      {actualPoints.length > 0 && <path d={actual} fill="none" className="stroke-sky-600" strokeWidth={3} strokeLinejoin="round" />}
      {last && <circle cx={x(last.day)} cy={y(last.actual!)} r={4} className="fill-sky-600" />}
    </svg>
    <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      <span className="inline-flex items-center gap-1.5"><span className="h-0 w-5 border-t-2 border-dashed border-slate-400" />Kế hoạch (cộng dồn theo số ngày)</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-sky-600" />Thực tế</span>
      {todayPoint && <span>Hôm nay N{todayPoint.day}: KH {pct(todayPoint.planned)} · TT {pct(todayPoint.actual ?? 0)}</span>}
    </figcaption>
  </figure>;
}

/** Form cập nhật thực tế một mốc + lịch sử các lần cập nhật. */
export function ActualForm({ item, logs, today, onDone }: { item: OverhaulMilestone; logs: MilestoneProgressLog[]; today: string; onDone: () => void }) {
  const range = isRangeMilestone(item);
  const update = useUpdateMilestoneActual();
  const [done, setDone] = React.useState(Boolean(item.actualEnd));
  const [actualStart, setActualStart] = React.useState(item.actualStart ?? "");
  const [actualEnd, setActualEnd] = React.useState(item.actualEnd ?? today);
  const [percent, setPercent] = React.useState(item.actualPercent ?? 0);
  const [note, setNote] = React.useState("");
  const [reportDate, setReportDate] = React.useState(today);
  const history = logs.filter(log => log.milestoneId === item.id).reverse();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await update.mutateAsync({ id: item.id, actualStart: actualStart || null, actualEnd: done ? actualEnd : null,
        percent: done ? 100 : range ? Math.min(99, percent) : 0, note: note.trim() || null, reportDate });
      toast.success("Đã cập nhật thực tế");
      onDone();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể cập nhật thực tế"); }
  }
  return <form onSubmit={submit} className="space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
    <div className="rounded-lg bg-slate-50 p-3 text-sm">
      <p className="font-semibold text-navy">{item.title}</p>
      <p className="mt-1 text-xs text-slate-500">Kế hoạch: {milestoneDateLabel(item.startDate)}{range ? ` – ${milestoneDateLabel(item.endDate!)}` : ""}</p>
    </div>
    {range && <div className="grid gap-4 sm:grid-cols-2">
      <label className="block min-w-0 text-sm font-medium text-navy">Ngày bắt đầu thực tế
        <Input type="date" max={today} value={actualStart} onChange={e => setActualStart(e.target.value)} className="mt-2 h-11 min-w-0 max-w-full text-base sm:text-sm" />
      </label>
      {!done && <label className="block text-sm font-medium text-navy">Đã làm được <b className="tabular-nums">{Math.min(99, percent)}%</b>
        <input type="range" min={0} max={99} step={1} value={Math.min(99, percent)} onChange={e => setPercent(Number(e.target.value))} className="mt-4 w-full accent-sky-700" aria-label="% đã làm" />
      </label>}
    </div>}
    <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm font-medium text-navy">
      <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={done} onChange={e => setDone(e.target.checked)} />Đã hoàn thành
    </label>
    {done && <label className="block min-w-0 text-sm font-medium text-navy">Ngày hoàn thành thực tế
      <Input type="date" required max={today} min={actualStart || undefined} value={actualEnd} onChange={e => setActualEnd(e.target.value)} className="mt-2 h-11 min-w-0 max-w-full text-base sm:text-sm" />
    </label>}
    <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
      <label className="block text-sm font-medium text-navy">Ghi chú
        <textarea maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="Vướng mắc, nguyên nhân chậm…" className="mt-2 min-h-20 w-full rounded-lg border border-input bg-white p-3 text-base font-normal sm:text-sm" />
      </label>
      <label className="block min-w-0 text-sm font-medium text-navy">Ngày ghi nhận
        <Input type="date" required max={today} value={reportDate} onChange={e => setReportDate(e.target.value)} className="mt-2 h-11 min-w-0 max-w-full text-base sm:text-sm" />
        <span className="mt-1 block text-xs font-normal text-slate-500">Số liệu đúng tới hết ngày này (nhập bù được).</span>
      </label>
    </div>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={update.isPending} className="h-11" onClick={onDone}>Huỷ</Button><Button disabled={update.isPending} className="h-11">{update.isPending ? "Đang lưu…" : "Lưu thực tế"}</Button></div>
    {history.length > 0 && <section className="border-t border-slate-100 pt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lịch sử cập nhật</h4>
      <ul className="mt-2 space-y-2">{history.map(log => <li key={log.id} className="text-xs text-slate-600">
        <b className="text-navy">{milestoneDateLabel(log.reportDate)}</b> · {log.actualEnd ? `Hoàn thành ${milestoneDateLabel(log.actualEnd)}` : `${log.percent}%`}
        {log.createdByName ? ` · ${log.createdByName}` : ""}{log.note ? <span className="block text-slate-500">{log.note}</span> : null}
      </li>)}</ul>
    </section>}
  </form>;
}
