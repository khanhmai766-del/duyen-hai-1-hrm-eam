"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { UNIT_LABELS, type BaseUnit } from "@/lib/chemical-inventory/constants";
import { useChemicalAnnualSummary } from "@/hooks/useChemicalInventory";
import { fmt, MONTH_LABELS, UNIT_GROUPS } from "./shared";

/**
 * Tổng hợp năm: ma trận mặt hàng × 12 tháng.
 *
 * Hai quy tắc quan trọng ở đây:
 *  - Tháng chưa mở kỳ hiện “—”, KHÔNG vẽ thành 0 — một cột 0 trông như đã chốt sổ
 *    và không dùng gì cả, sai hoàn toàn.
 *  - Mỗi đơn vị một biểu đồ riêng. Gộp kg với tấn và lít vào một trục là vô nghĩa.
 */

const CHART_COLORS = ["#1264c8", "#00a6c8", "#0f8b7e", "#b26a00", "#7c3aed", "#b3261e"];

export function AnnualTab({ year, onChangeYear }: { year: number; onChangeYear: (y: number) => void }) {
  const [mode, setMode] = useState<"consumed" | "received">("consumed");
  const { data, isLoading, isError, refetch } = useChemicalAnnualSummary(year);

  const openSet = useMemo(() => new Set(data?.openPeriods ?? []), [data]);

  const chartData = useMemo(() => {
    if (!data) return {} as Record<string, Array<Record<string, number | string | null>>>;
    const byUnit: Record<string, Array<Record<string, number | string | null>>> = {};
    for (const group of UNIT_GROUPS) {
      const rows = data.rows.filter((r) => r.baseUnit === group.unit);
      if (rows.length === 0) continue;
      byUnit[group.unit] = data.months.map((periodKey, index) => {
        const point: Record<string, number | string | null> = { month: MONTH_LABELS[index] };
        for (const row of rows) {
          // Tháng chưa mở kỳ → null, recharts sẽ bỏ trống thay vì vẽ đáy 0.
          point[row.name] = openSet.has(periodKey) ? row[mode][index] : null;
        }
        return point;
      });
    }
    return byUnit;
  }, [data, mode, openSet]);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (isError || !data) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Không tải được tổng hợp năm"
        action={{ label: "Thử lại", onClick: () => void refetch() }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          <Button size="sm" variant={mode === "consumed" ? "default" : "ghost"} onClick={() => setMode("consumed")}>
            Lượng sử dụng
          </Button>
          <Button size="sm" variant={mode === "received" ? "default" : "ghost"} onClick={() => setMode("received")}>
            Lượng nhập
          </Button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => onChangeYear(year - 1)}>
            ← {year - 1}
          </Button>
          <span className="min-w-[64px] text-center text-sm font-semibold tabular-nums">{year}</span>
          <Button size="sm" variant="outline" onClick={() => onChangeYear(year + 1)}>
            {year + 1} →
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="sticky left-0 z-10 min-w-[210px] border-r border-border bg-muted px-3 py-2 text-left font-semibold">
                Mặt hàng
              </th>
              <th className="px-2 py-2 text-left font-semibold">Đơn vị</th>
              {MONTH_LABELS.map((m) => (
                <th key={m} className="px-2 py-2 text-right font-semibold">
                  {m}
                </th>
              ))}
              <th className="border-l border-border bg-slate-100 px-2 py-2 text-right font-semibold">Cả năm</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.itemId} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                <th
                  scope="row"
                  className="sticky left-0 z-[1] min-w-[210px] border-r border-border bg-white px-3 py-1.5 text-left font-medium text-ink"
                >
                  <span className="block truncate">{row.name}</span>
                </th>
                <td className="whitespace-nowrap px-2 py-1.5 text-xs text-muted-foreground">{UNIT_LABELS[row.baseUnit]}</td>
                {row[mode].map((value, index) => {
                  const opened = openSet.has(data.months[index]);
                  return (
                    <td
                      key={index}
                      className={cn(
                        "px-2 py-1.5 text-right tabular-nums",
                        !opened && "text-muted-foreground/60",
                        value !== null && value < 0 && "font-semibold text-red-700"
                      )}
                      title={!opened ? "Chưa có dữ liệu — kỳ chưa được mở" : undefined}
                    >
                      {opened ? fmt(value) : "—"}
                    </td>
                  );
                })}
                <td className="border-l border-border/50 bg-slate-50 px-2 py-1.5 text-right font-semibold tabular-nums">
                  {fmt(mode === "consumed" ? row.consumedTotal : row.receivedTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Dấu “—” nghĩa là kỳ tháng đó chưa được mở, chưa có dữ liệu — không phải bằng 0.
      </p>

      {/* Mỗi đơn vị một biểu đồ riêng: kg, tấn và lít không chung trục được. */}
      <div className="grid gap-4 xl:grid-cols-2">
        {UNIT_GROUPS.filter((g) => chartData[g.unit]?.length).map((group) => {
          const rows = data.rows.filter((r) => r.baseUnit === group.unit);
          return (
            <div key={group.unit} className="rounded-xl border border-border bg-white p-4">
              <h4 className="text-sm font-semibold text-ink">
                {group.label} · {mode === "consumed" ? "lượng sử dụng" : "lượng nhập"} ({UNIT_LABELS[group.unit as BaseUnit]})
              </h4>
              <div className="mt-3 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData[group.unit]} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={64} tickFormatter={(v: number) => fmt(v, 0)} />
                    <Tooltip
                      formatter={(v: number | string) => fmt(typeof v === "number" ? v : null)}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {rows.map((row, i) => (
                      <Bar key={row.itemId} dataKey={row.name} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[2, 2, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
