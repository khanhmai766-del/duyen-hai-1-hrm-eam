"use client";

import * as React from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleGauge,
  Clock3,
  FlaskConical,
  MapPin,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  REPL_DUE,
  REPL_DUE_ORDER,
  daysUntilDue,
  replacementDueStatus,
  replacementIntervalLabel,
  type ReplDueKey,
} from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";

export type ReplacementStatusPoint = {
  id: string;
  materialName: string;
  materialCode: string;
  unit: string;
  machine: string;
  category: string | null;
  deviceCode: string | null;
  deviceName: string | null;
  system: string | null;
  managingPosition: string | null;
  nextDueAt: Date | string;
  lastReplacedAt: Date | string | null;
  intervalMonths: number;
  intervalNote: string | null;
  quantity: number;
  deviceCount: number;
  isDemo?: boolean;
};

type StatusFilter = "ALL" | ReplDueKey;

const STATUS_STYLE: Record<ReplDueKey, {
  icon: typeof AlertTriangle;
  card: string;
  iconWrap: string;
  value: string;
  row: string;
}> = {
  OVERDUE: {
    icon: AlertTriangle,
    card: "border-rose-200 bg-[linear-gradient(135deg,#fff_15%,#fff1f2)]",
    iconWrap: "bg-rose-100 text-rose-600",
    value: "text-rose-700",
    row: "border-l-rose-500",
  },
  DUE_SOON: {
    icon: Clock3,
    card: "border-amber-200 bg-[linear-gradient(135deg,#fff_15%,#fffbeb)]",
    iconWrap: "bg-amber-100 text-amber-600",
    value: "text-amber-700",
    row: "border-l-amber-500",
  },
  OK: {
    icon: CheckCircle2,
    card: "border-emerald-200 bg-[linear-gradient(135deg,#fff_15%,#ecfdf5)]",
    iconWrap: "bg-emerald-100 text-emerald-600",
    value: "text-emerald-700",
    row: "border-l-emerald-500",
  },
};

function dueLabel(point: ReplacementStatusPoint) {
  const days = daysUntilDue(point.nextDueAt);
  if (days < 0) return `Quá hạn ${Math.abs(days)} ngày`;
  if (days === 0) return "Đến hạn hôm nay";
  return `Còn ${days} ngày`;
}

export function ReplacementStatusDashboard({
  points,
  isLoading,
}: {
  points: ReplacementStatusPoint[];
  isLoading?: boolean;
}) {
  const [filter, setFilter] = React.useState<StatusFilter>("ALL");
  const counts = React.useMemo(() => {
    const value = { OVERDUE: 0, DUE_SOON: 0, OK: 0 };
    for (const point of points) value[replacementDueStatus(point.nextDueAt)] += 1;
    return value;
  }, [points]);
  const filtered = React.useMemo(
    () =>
      [...points]
        .filter((point) => filter === "ALL" || replacementDueStatus(point.nextDueAt) === filter)
        .sort((a, b) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime()),
    [filter, points]
  );
  const total = points.length;
  const safeRate = total ? Math.round((counts.OK / total) * 100) : 0;
  const demoCount = points.filter((point) => point.isDemo).length;

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-2xl border border-border bg-muted/50" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {demoCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
          <div>
            <span className="font-semibold">Chế độ xem thử localhost:</span>{" "}
            đang bổ sung {demoCount} điểm minh họa để thể hiện đủ ba trạng thái. Dữ liệu này không được lưu vào hệ thống.
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="relative overflow-hidden border-navy/15 bg-[radial-gradient(circle_at_90%_0%,rgba(14,165,233,0.14),transparent_38%),linear-gradient(135deg,#0f294d,#173f70)] p-5 text-white shadow-lg shadow-navy/10">
          <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full border border-white/10" />
          <div className="absolute -right-4 -top-10 h-32 w-32 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-sky-100">
                <CircleGauge className="h-4 w-4" /> Sức khỏe chu kỳ thay thế
              </div>
              <div className="mt-3 flex items-end gap-3">
                <strong className="text-5xl font-black leading-none tracking-tight">{safeRate}%</strong>
                <span className="pb-1 text-sm text-sky-100">điểm còn trong hạn an toàn</span>
              </div>
            </div>
            <div className="min-w-[220px]">
              <div className="mb-2 flex justify-between text-xs text-sky-100">
                <span>{total} điểm đang theo dõi</span>
                <span>{counts.OVERDUE + counts.DUE_SOON} cần chú ý</span>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-white/15">
                {REPL_DUE_ORDER.map((key) => (
                  <span
                    key={key}
                    style={{
                      width: `${total ? (counts[key] / total) * 100 : 0}%`,
                      backgroundColor: REPL_DUE[key].dot,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card className="flex items-center justify-between overflow-hidden border-slate-200 bg-slate-50/70 p-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Tổng điểm theo dõi</div>
            <div className="mt-2 text-4xl font-black tracking-tight text-navy">{total}</div>
            <div className="mt-1 text-sm text-muted-foreground">Từ các điểm thay thế đang hoạt động</div>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy text-white shadow-md shadow-navy/20">
            <CalendarClock className="h-7 w-7" />
          </div>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {REPL_DUE_ORDER.map((key) => {
          const style = STATUS_STYLE[key];
          const Icon = style.icon;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(filter === key ? "ALL" : key)}
              className={cn(
                "group rounded-2xl border p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md",
                style.card,
                filter === key && "ring-2 ring-navy ring-offset-2"
              )}
            >
              <div className="flex items-center justify-between">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", style.iconWrap)}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className={cn("text-3xl font-black tracking-tight", style.value)}>{counts[key]}</span>
              </div>
              <div className="mt-3 font-bold text-ink">{REPL_DUE[key].label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {key === "OVERDUE" && "Đã qua ngày đến hạn, cần ưu tiên xử lý"}
                {key === "DUE_SOON" && "Còn tối đa 30 ngày trước thời điểm thay"}
                {key === "OK" && "Còn trên 30 ngày trước thời điểm thay"}
              </div>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-slate-50/70 px-4 py-3">
          <div>
            <div className="text-sm font-bold text-ink">Chi tiết trạng thái điểm theo dõi</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Sắp xếp theo thời điểm cần thay gần nhất
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={filter === "ALL" ? "default" : "outline"}
              className="h-8 rounded-full"
              onClick={() => setFilter("ALL")}
            >
              Tất cả <span className="ml-1 rounded-full bg-current/10 px-1.5 text-xs">{total}</span>
            </Button>
            {REPL_DUE_ORDER.map((key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={filter === key ? "default" : "outline"}
                className="h-8 rounded-full"
                onClick={() => setFilter(key)}
              >
                <span className="mr-1.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: REPL_DUE[key].dot }} />
                {REPL_DUE[key].label} {counts[key]}
              </Button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
            <div className="mt-3 font-semibold text-ink">Không có điểm theo dõi trong nhóm này</div>
            <div className="mt-1 text-sm text-muted-foreground">Thử chọn trạng thái hoặc bộ lọc khác.</div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((point) => {
              const status = replacementDueStatus(point.nextDueAt);
              const style = STATUS_STYLE[status];
              return (
                <div
                  key={point.id}
                  className={cn(
                    "grid gap-3 border-l-4 px-4 py-3 transition-colors hover:bg-slate-50/70 xl:grid-cols-[minmax(220px,1.2fr)_minmax(180px,1fr)_165px_165px_165px_130px] xl:items-center",
                    style.row
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-ink">{point.materialName}</span>
                      {point.isDemo && (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700">
                          Minh họa
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-navy">{point.materialCode}</div>
                  </div>

                  <div className="min-w-0 text-sm">
                    <div className="flex items-center gap-1.5 truncate font-medium text-ink">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {point.deviceName || "Chưa khai báo thiết bị"}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {point.system || "Chưa khai báo hệ thống"}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cương vị</div>
                    <div className="mt-0.5 break-words text-sm font-medium leading-5 text-ink">
                      {point.managingPosition || "Chưa gán cương vị"}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Chu kỳ</div>
                    <div className="mt-0.5 text-sm font-medium text-ink">
                      {replacementIntervalLabel(point.intervalMonths, point.intervalNote)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Đến hạn</div>
                    <div className="mt-0.5 text-sm font-semibold text-ink">{formatDate(point.nextDueAt)}</div>
                    <div className="text-xs text-muted-foreground">Lần gần nhất {formatDate(point.lastReplacedAt)}</div>
                  </div>

                  <div className="lg:text-right">
                    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-bold", REPL_DUE[status].badge)}>
                      {dueLabel(point)}
                    </span>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {point.quantity * Math.max(1, point.deviceCount)} {point.unit}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
