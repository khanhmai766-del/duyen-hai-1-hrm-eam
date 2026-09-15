"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { UNIT_LABELS, type BaseUnit } from "@/lib/chemical-inventory/constants";
import { useChemicalAnnualSummary, type AnnualRow } from "@/hooks/useChemicalInventory";
import { fmt, MONTH_LABELS, UNIT_GROUPS } from "./shared";

/**
 * Tổng hợp năm: ma trận mặt hàng × 12 tháng.
 *
 * Hai quy tắc quan trọng ở đây:
 *  - Tháng chưa mở kỳ hiện “—”, KHÔNG vẽ thành 0 — một cột 0 trông như đã chốt sổ
 *    và không dùng gì cả, sai hoàn toàn.
 *  - Mỗi đơn vị một khối riêng. Gộp kg với tấn và lít vào một trục là vô nghĩa.
 */

/**
 * Mỗi nhóm MỘT màu, mỗi mặt hàng MỘT biểu đồ nhỏ có trục riêng.
 *
 * Bản cũ vẽ 5–6 mặt hàng chung một trục: NH3 (~600.000 kg/tháng) đè bẹp mọi hóa chất khác
 * (vài nghìn kg) thành vạch sát đáy, cột mỏng như sợi chỉ, phải dò chú giải theo màu. Tách trục
 * thì mặt hàng nào cũng đọc được hình dạng theo tháng; màu không còn phải mã hoá tên hàng.
 */
const GROUP_COLOR: Record<BaseUnit, string> = { KG: "#1264c8", TON: "#0f766e", LITER: "#6d28d9" };
/** Cột âm — kỳ có nạp bồn mà sổ không ghi lượng nhập (xem calculateConsumedTotal). */
const NEGATIVE_COLOR = "#d97706";

/**
 * Nhãn trục Y viết ĐỦ số kiểu Việt Nam ("750.000", "1.200", "0,05").
 *
 * Không dùng dạng rút gọn của Intl ("750 N", "1,2 N"): chữ "N" (nghìn) dễ đọc nhầm thành Newton
 * hay một đơn vị khác, và nó làm tròn 1 số lẻ nên bồn gần như không phát sinh ra vạch "0 / 0 / -0".
 * Số nhỏ giữ 2 số lẻ; không bao giờ in "-0".
 */
function axisNumber(value: number) {
  const digits = Math.abs(value) >= 100 ? 0 : 2;
  const text = value.toLocaleString("vi-VN", { maximumFractionDigits: digits });
  return text === "-0" ? "0" : text;
}

type MiniPoint = { m: number; value: number | null };

function MiniTooltip({ active, payload, unit }: { active?: boolean; payload?: { payload: MiniPoint }[]; unit: string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-white px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-semibold text-ink">Tháng {point.m}</div>
      <div className="tabular-nums text-slate-700">
        {point.value === null ? "Chưa mở kỳ — chưa có dữ liệu" : `${fmt(point.value)} ${unit}`}
      </div>
      {point.value !== null && point.value < 0 && (
        <div className="mt-0.5 max-w-[220px] text-amber-700">Âm: kỳ có nạp bồn nhưng sổ không ghi lượng nhập</div>
      )}
    </div>
  );
}

function ItemMiniChart({
  row,
  values,
  total,
  unit,
  color,
}: {
  row: AnnualRow;
  values: (number | null)[];
  total: number | null;
  unit: string;
  color: string;
}) {
  const data: MiniPoint[] = values.map((value, index) => ({ m: index + 1, value }));
  const hasValue = values.some((v) => v !== null);
  const allZero = hasValue && values.every((v) => v === null || v === 0);
  const hasNegative = values.some((v) => v !== null && v < 0);

  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-border/70 bg-slate-50/40 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[13px] font-medium text-ink" title={row.name}>
          {row.name}
        </span>
        <span className="shrink-0 whitespace-nowrap text-right">
          <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">Cả năm</span>
          <span className={cn("text-[15px] font-semibold tabular-nums", total !== null && total < 0 ? "text-amber-700" : "text-ink")}>
            {fmt(total)}
          </span>
          <span className="ml-1 text-[11px] text-muted-foreground">{unit}</span>
        </span>
      </div>

      {!hasValue || allZero ? (
        <div className="mt-2 flex h-[132px] items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
          {hasValue ? "Không phát sinh trong năm" : "Chưa có dữ liệu năm này"}
        </div>
      ) : (
        <div className="mt-2 h-[132px] w-full" role="img" aria-label={`Biểu đồ theo tháng của ${row.name}, cả năm ${fmt(total)} ${unit}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap="24%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis
                dataKey="m"
                tickFormatter={(m: number) => `T${m}`}
                tick={{ fontSize: 10, fill: "#64748B" }}
                axisLine={{ stroke: "#CBD5E1" }}
                tickLine={false}
                interval={0}
              />
              <YAxis
                width={52}
                tickCount={4}
                tick={{ fontSize: 10, fill: "#94A3B8" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={axisNumber}
              />
              {hasNegative && <ReferenceLine y={0} stroke="#94A3B8" />}
              <Tooltip cursor={{ fill: "#F1F5F9" }} content={<MiniTooltip unit={unit} />} />
              <Bar dataKey="value" maxBarSize={18} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {data.map((point) => (
                  <Cell key={point.m} fill={point.value !== null && point.value < 0 ? NEGATIVE_COLOR : color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function AnnualTab({ year, onChangeYear }: { year: number; onChangeYear: (y: number) => void }) {
  const [mode, setMode] = useState<"consumed" | "received">("consumed");
  const { data, isLoading, isError, refetch } = useChemicalAnnualSummary(year);

  const openSet = useMemo(() => new Set(data?.openPeriods ?? []), [data]);

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

  const modeLabel = mode === "consumed" ? "lượng sử dụng" : "lượng nhập";
  // Tháng chưa mở kỳ → null: biểu đồ bỏ trống thay vì vẽ đáy 0.
  const monthValues = (row: AnnualRow) => row[mode].map((value, index) => (openSet.has(data.months[index]) ? value : null));

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

      {/* Mỗi đơn vị một khối; trong khối, mỗi mặt hàng một biểu đồ nhỏ có trục riêng. */}
      {UNIT_GROUPS.map((group) => {
        const rows = data.rows.filter((r) => r.baseUnit === group.unit);
        if (rows.length === 0) return null;
        const unit = UNIT_LABELS[group.unit];
        const groupHasNegative = rows.some((row) => monthValues(row).some((v) => v !== null && v < 0));
        return (
          <section key={group.unit} className="rounded-xl border border-border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
              <h4 className="text-sm font-semibold text-ink">
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: GROUP_COLOR[group.unit] }} aria-hidden="true" />
                {group.label} · {modeLabel} <span className="font-normal text-muted-foreground">({unit})</span>
              </h4>
              {groupHasNegative && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: NEGATIVE_COLOR }} aria-hidden="true" />
                  Cột cam là tháng âm — kỳ có nạp bồn nhưng sổ không ghi lượng nhập, giữ nguyên để đối soát
                </p>
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((row) => (
                <ItemMiniChart
                  key={row.itemId}
                  row={row}
                  values={monthValues(row)}
                  total={mode === "consumed" ? row.consumedTotal : row.receivedTotal}
                  unit={unit}
                  color={GROUP_COLOR[group.unit]}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
