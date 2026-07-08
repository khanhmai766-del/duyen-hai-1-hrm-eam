"use client";

import * as React from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { REPL_DUE, REPL_DUE_ORDER, replacementDueStatus, type ReplDueKey } from "@/lib/constants";
import type { ReplacementItem } from "@/hooks/useReplacements";

/** "YYYY-MM-DD" theo giờ địa phương — khoá so khớp ô ngày trên lịch. */
export function dayKey(d: Date | string): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const MAX_CHIPS_PER_DAY = 3;

// Chip sự kiện tô đặc theo trạng thái đến hạn (đồng bộ màu với REPL_DUE).
const CHIP_STYLE: Record<ReplDueKey, string> = {
  OVERDUE: "bg-red-600 text-white hover:bg-red-700",
  DUE_SOON: "bg-amber-500 text-white hover:bg-amber-600",
  OK: "bg-emerald-600 text-white hover:bg-emerald-700",
};

interface ReplacementCalendarProps {
  /** Tháng đang xem, dạng "YYYY-MM". */
  month: string;
  onMonthChange: (month: string) => void;
  /** Các điểm thay thế có nextDueAt thuộc tháng đang xem (đã qua bộ lọc). */
  points: ReplacementItem[];
  /** Ngày đang chọn ("YYYY-MM-DD") — tô sáng ô và lọc panel bên phải. */
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
  /** Nội dung góc phải header (vd chip lọc trạng thái); mặc định hiện chú thích màu. */
  headerRight?: React.ReactNode;
}

/** Lịch tháng cho tab "Lịch thay thế": mỗi điểm thay thế là một chip màu tại ngày đến hạn. */
export function ReplacementCalendar({ month, onMonthChange, points, selectedDay, onSelectDay, headerRight }: ReplacementCalendarProps) {
  const [year, mon] = month.split("-").map(Number);
  const firstOfMonth = new Date(year, mon - 1, 1);
  const monthLabel = `Tháng ${mon} · ${year}`;

  const shiftMonth = (delta: number) => {
    const d = new Date(year, mon - 1 + delta, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const goToday = () => {
    const now = new Date();
    onMonthChange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    onSelectDay(dayKey(now));
  };

  // Bấm tiêu đề tháng → mở hộp chọn tháng/năm native (input type="month" ẩn).
  const monthInputRef = React.useRef<HTMLInputElement>(null);
  const openMonthPicker = () => {
    const el = monthInputRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  };

  // Gom điểm theo ngày đến hạn để tra nhanh khi vẽ từng ô.
  const byDay = React.useMemo(() => {
    const map = new Map<string, ReplacementItem[]>();
    for (const p of points) {
      const k = dayKey(p.nextDueAt);
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return map;
  }, [points]);

  // Lưới 6 tuần × 7 ngày, bắt đầu từ Thứ 2 của tuần chứa mùng 1.
  const cells = React.useMemo(() => {
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - ((firstOfMonth.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const todayKey = dayKey(new Date());

  return (
    <Card className="overflow-hidden">
      {/* Thanh điều hướng tháng + chú thích màu */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" aria-label="Tháng trước" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" aria-label="Tháng sau" onClick={() => shiftMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="ml-1 h-8 rounded-lg" onClick={goToday}>
            Hôm nay
          </Button>
        </div>
        <div className="relative flex-1 text-center">
          <button
            type="button"
            onClick={openMonthPicker}
            title="Chọn tháng/năm"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-base font-bold text-ink transition-colors hover:bg-muted/70"
          >
            <CalendarDays className="h-4 w-4 text-accent" />
            {monthLabel}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
          {/* Input ẩn neo ngay dưới tiêu đề để hộp chọn của trình duyệt bung đúng chỗ */}
          <input
            ref={monthInputRef}
            type="month"
            value={month}
            onChange={(e) => e.target.value && onMonthChange(e.target.value)}
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-full h-px w-px -translate-x-1/2 opacity-0"
          />
        </div>
        {headerRight ?? (
          <div className="hidden items-center gap-3 md:flex">
            {REPL_DUE_ORDER.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: REPL_DUE[k].dot }} />
                {REPL_DUE[k].label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          {/* Hàng thứ trong tuần */}
          <div className="grid grid-cols-7 border-b border-border bg-muted/40">
            {WEEKDAYS.map((w) => (
              <div key={w} className={cn("px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide", w === "CN" ? "text-red-600/80" : "text-muted-foreground")}>
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const k = dayKey(d);
              const inMonth = d.getMonth() === mon - 1;
              const isToday = k === todayKey;
              const isSelected = k === selectedDay;
              const events = byDay.get(k) ?? [];
              const overflow = events.length - MAX_CHIPS_PER_DAY;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => inMonth && onSelectDay(isSelected ? null : k)}
                  className={cn(
                    "relative flex min-h-[104px] flex-col items-stretch gap-1 border-border/70 p-1.5 text-left align-top transition-colors",
                    i % 7 !== 0 && "border-l",
                    i >= 7 && "border-t",
                    inMonth ? "bg-white hover:bg-sky-50/60 dark:bg-card dark:hover:bg-slate-800/60" : "cursor-default bg-muted/20",
                    d.getDay() === 0 && inMonth && "bg-rose-50/40 dark:bg-rose-950/10",
                    isSelected && "ring-2 ring-inset ring-accent"
                  )}
                >
                  <span className="flex justify-end">
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-sm tabular-nums",
                        isToday ? "bg-navy font-bold text-white shadow-sm" : inMonth ? "font-medium text-ink" : "text-muted-foreground/50"
                      )}
                    >
                      {d.getDate()}
                    </span>
                  </span>
                  {events.slice(0, MAX_CHIPS_PER_DAY).map((p) => (
                    <span
                      key={p.id}
                      title={`${p.material.code} — ${p.material.name}`}
                      className={cn("block w-full truncate rounded px-1.5 py-0.5 text-[11px] font-medium shadow-sm", CHIP_STYLE[replacementDueStatus(p.nextDueAt)])}
                    >
                      {p.material.name}
                    </span>
                  ))}
                  {overflow > 0 && <span className="px-1 text-[11px] font-semibold text-accent">+{overflow} vật tư khác</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
