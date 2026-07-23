"use client";

import * as React from "react";
import { CalendarDays, Check, CheckCircle2, Clock, Phone, RefreshCw, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SHIFT_TYPE, SHIFT_TYPE_ORDER, type ShiftTypeKey } from "@/lib/constants";
import { ORG_CHIEF, ORG_LEADS, type OrgTone } from "@/lib/org-template";
import { cn, formatDate, initials } from "@/lib/utils";

type PublicAssignment = {
  id: string;
  positionLabel: string;
  isApproved: boolean;
  user: { id: string; name: string; avatarUrl: string | null; phone: string | null; position: string | null; secondaryPosition: string | null };
};

type PublicOrgChartPayload = {
  date: string;
  shiftType: ShiftTypeKey;
  unit: string;
  shift: { id: string; date: string; shiftType: ShiftTypeKey; unit: string; isAttendanceLocked: boolean; assignments: PublicAssignment[] } | null;
};

type ApiResponse<T> = { data: T | null; error: string | null };

const TONE_STYLES: Record<OrgTone | "chief", { bar: string; cell: string; title: string; block: string; filled: string }> = {
  chief: { bar: "border-pink-200 bg-pink-50", cell: "border-pink-200 bg-pink-50/60", title: "text-pink-700", block: "", filled: "border-pink-300 shadow-[0_10px_24px_-10px_rgba(236,72,153,0.5)]" },
  blue: { bar: "border-blue-200 bg-blue-50", cell: "border-blue-200 bg-blue-50/50", title: "text-blue-700", block: "bg-blue-50/30", filled: "border-blue-300 shadow-[0_10px_24px_-10px_rgba(37,99,235,0.5)]" },
  green: { bar: "border-green-200 bg-green-50", cell: "border-green-200 bg-green-50/50", title: "text-green-700", block: "bg-green-50/30", filled: "border-emerald-300 shadow-[0_10px_24px_-10px_rgba(16,185,129,0.5)]" },
};

async function loadOrgChart(date?: string, shiftType?: ShiftTypeKey) {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (shiftType) params.set("shiftType", shiftType);
  const query = params.size ? `?${params.toString()}` : "";
  const res = await fetch(`/api/public/org-chart${query}`, { cache: "no-store" });
  const json = (await res.json()) as ApiResponse<PublicOrgChartPayload>;
  if (!res.ok || json.error || !json.data) throw new Error(json.error || "Không tải được sơ đồ tổ chức ca");
  return json.data;
}

export function PublicOrgChartClient() {
  const [data, setData] = React.useState<PublicOrgChartPayload | null>(null);
  const [error, setError] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = React.useState("");
  const [selectedShiftType, setSelectedShiftType] = React.useState<ShiftTypeKey | "">("");

  const refresh = React.useCallback(async (background = false) => {
    if (!background) setIsRefreshing(true);
    try {
      setError("");
      const next = await loadOrgChart(selectedDate || undefined, selectedShiftType || undefined);
      setData(next);
      setSelectedDate(next.date);
      setSelectedShiftType(next.shiftType);
      setUpdatedAt(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedDate, selectedShiftType]);

  React.useEffect(() => {
    void refresh(true);
    const timer = window.setInterval(() => void refresh(true), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const assignments = data?.shift?.assignments ?? [];
  const approved = assignments.filter((item) => item.isApproved).length;
  const caLabel = data ? `${SHIFT_TYPE[data.shiftType]?.label ?? ""} · ${formatDate(data.date)}` : "Đang tải";
  const dateBounds = React.useMemo(() => {
    const formatLocalDate = (value: Date) => {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, "0");
      const day = String(value.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return { min: formatLocalDate(yesterday), max: formatLocalDate(today) };
  }, []);

  return (
    <main className="min-h-dvh bg-[#f4f7f3] text-slate-950">
      <header className="border-b border-emerald-900/10 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Link công khai
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Sơ đồ tổ chức ca vận hành</h1>
              <p className="text-sm font-medium text-slate-600">{caLabel}{data?.unit ? ` · ${data.unit}` : ""}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 shadow-sm">
                <CalendarDays className="h-4 w-4 shrink-0 text-emerald-700" />
                <input
                  type="date"
                  aria-label="Chọn ngày xem sơ đồ"
                  min={dateBounds.min}
                  max={dateBounds.max}
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="h-9 min-w-0 bg-transparent text-sm font-semibold text-slate-800 outline-none"
                />
              </div>
              <select
                aria-label="Chọn ca vận hành"
                value={selectedShiftType}
                onChange={(event) => setSelectedShiftType(event.target.value as ShiftTypeKey)}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                {SHIFT_TYPE_ORDER.map((type) => <option key={type} value={type}>{SHIFT_TYPE[type].label}</option>)}
              </select>
              {data?.shift && <Badge variant={approved === assignments.length ? "accent" : "secondary"} className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> {approved}/{assignments.length} đã duyệt</Badge>}
              <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={isRefreshing} className="bg-white">
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} /> Cập nhật
              </Button>
            </div>
          </div>
          {updatedAt && <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Clock className="h-3.5 w-3.5" /> Tự động cập nhật mỗi 30 giây · Lần cập nhật cuối {updatedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</div>}
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
        {isLoading ? <ChartSkeleton /> : error ? (
          <Card className="border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">{error}</Card>
        ) : !data?.shift ? <EmptyState title="Chưa có dữ liệu ca đã chọn" description="Hãy chọn ngày hoặc ca khác trong phạm vi hôm nay và 1 ngày trước." /> : (
          <PublicTemplateChart assignments={assignments} />
        )}
      </section>
    </main>
  );
}

function PublicTemplateChart({ assignments }: { assignments: PublicAssignment[] }) {
  const byTitle = React.useMemo(() => {
    const map = new Map<string, PublicAssignment[]>();
    assignments.forEach((assignment) => map.set(assignment.positionLabel, [...(map.get(assignment.positionLabel) ?? []), assignment]));
    return map;
  }, [assignments]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="space-y-3 sm:space-y-4">
        <SeatBox title={ORG_CHIEF} occupants={byTitle.get(ORG_CHIEF)} tone="chief" bar />
        <div className="flex flex-col items-stretch gap-3 xl:flex-row xl:gap-4">
          {ORG_LEADS.map((lead) => (
            <section key={lead.title} className={cn("min-w-0 space-y-2 rounded-lg p-1.5 sm:p-2", TONE_STYLES[lead.tone].block)} style={{ flex: lead.columns.length }}>
              <SeatBox title={lead.title} occupants={byTitle.get(lead.title)} tone={lead.tone} bar />
              <div className={cn("grid grid-cols-1 gap-2", lead.columns.length > 1 && "md:grid-cols-2 xl:grid-cols-3")}>
                {lead.columns.map((column, index) => <div key={index} className="grid gap-2">{column.map((seat) => <SeatBox key={seat} title={seat} occupants={byTitle.get(seat)} tone={lead.tone} />)}</div>)}
              </div>
            </section>
          ))}
        </div>
      </div>
      <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500"><span className="font-semibold text-slate-900">Quy tắc hiển thị: </span><span className="font-semibold text-slate-900">Màu đen</span> = đã được duyệt; <span className="font-semibold text-amber-600">họ và tên màu cam</span> = chưa được duyệt.</div>
    </div>
  );
}

function SeatBox({ title, occupants, tone, bar = false }: { title: string; occupants?: PublicAssignment[]; tone: OrgTone | "chief"; bar?: boolean }) {
  const style = TONE_STYLES[tone];
  const filled = Boolean(occupants?.length);
  return (
    <article className={cn("group rounded-lg border text-center", bar ? "px-3 py-2.5" : "min-h-[88px] px-3 py-3", bar ? style.bar : style.cell, !filled && !bar && "border-dashed opacity-90", filled && style.filled)}>
      <h2 className={cn(bar ? "text-sm sm:text-xs" : "text-xs leading-tight", "font-semibold", style.title)}>{title}</h2>
      {filled ? <div className="mt-2 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">{occupants!.map((item) => <Person key={item.id} item={item} />)}</div> : <div className="mt-2 text-xs text-slate-400">— trống —</div>}
    </article>
  );
}

function Person({ item }: { item: PublicAssignment }) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const showImage = Boolean(item.user.avatarUrl) && !imageFailed;

  return <div className="flex min-w-0 items-center gap-3 rounded-lg bg-white/75 px-3 py-2 text-left shadow-sm ring-1 ring-slate-900/5 sm:flex-col sm:bg-transparent sm:px-1 sm:py-0 sm:text-center sm:shadow-none sm:ring-0">
    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-visible rounded-full bg-gradient-to-br from-slate-800 to-emerald-600 text-[11px] font-bold text-white shadow-md ring-2 ring-white">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.user.avatarUrl!}
          alt=""
          className="h-full w-full rounded-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : initials(item.user.name)}
      <span className={cn("absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-white shadow ring-2 ring-white", item.isApproved ? "bg-emerald-500" : "bg-amber-500")} title={item.isApproved ? "Đã được duyệt" : "Chưa được duyệt"}>{item.isApproved ? <Check className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}</span>
    </div>
    <div className="min-w-0 flex-1 sm:flex sm:flex-col sm:items-center">
      <strong className={cn("block text-sm leading-tight sm:mt-1.5 sm:max-w-[150px] sm:text-xs", item.isApproved ? "text-slate-950" : "text-amber-600")}>{item.user.name}</strong>
      {item.user.phone && <a href={`tel:${item.user.phone}`} className="mt-1 inline-flex min-h-6 items-center gap-1 text-xs font-bold text-slate-700 hover:text-emerald-700 sm:mt-0.5 sm:text-[10px]"><Phone className="h-3 w-3" /> {item.user.phone}</a>}
    </div>
  </div>;
}

function ChartSkeleton() { return <div className="space-y-3 rounded-xl border bg-white p-4"><Skeleton className="h-24 w-full rounded-lg" /><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 9 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-lg" />)}</div></div>; }

function EmptyState({ title, description }: { title: string; description: string }) { return <Card className="flex flex-col items-center gap-3 p-8 text-center"><UsersRound className="h-10 w-10 text-slate-400" /><div><p className="font-semibold text-slate-900">{title}</p><p className="mt-1 text-sm text-slate-500">{description}</p></div></Card>; }
