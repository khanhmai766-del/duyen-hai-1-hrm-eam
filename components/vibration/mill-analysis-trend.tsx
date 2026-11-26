"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { millIso, type AnalysisRecord, type AnalysisDevice } from "@/lib/vibration/analysis";
import { ZONE_LINE_COLORS, ZONE_LINE_KEYS, dayAxis, fmt2, trendRows, tsLabel, type MillCtx, type TrendLine } from "./mill-analysis-shared";

/** Biểu đồ xu hướng theo ngày (dùng cho 1 gối 3 phương, 1 gối 1 đường, hoặc 6 gối). Vạch vùng ISO khi bật. */
export function MillTrendChart({ rs, lines, ctx, device, isoBearing, height = 220, label }: {
  rs: AnalysisRecord[];
  lines: TrendLine[];
  ctx: MillCtx;
  device: AnalysisDevice;
  /** Gối dùng để lấy ranh giới vùng ISO; bỏ trống = không vẽ vạch. */
  isoBearing?: number;
  height?: number;
  label: string;
}) {
  const rows = React.useMemo(() => trendRows(rs, lines), [rs, lines]);
  const ax = React.useMemo(() => dayAxis(ctx.from, ctx.to), [ctx.from, ctx.to]);
  const limits = ctx.metric === "v" && ctx.rms && isoBearing ? millIso(0, device, isoBearing, ctx.rms).limits : null;
  const edges = limits ? ZONE_LINE_KEYS.map((k) => limits[k]) : [];
  if (!rows.length) return <p className="ma-empty">Không có số đo hợp lệ trong khoảng đã chọn.</p>;
  const edgeMax = edges.length ? edges[2] : 0;
  return (
    <div className="w-full" style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 14, bottom: 4, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="x" type="number" scale="time" domain={ax.domain} ticks={ax.ticks} tickFormatter={tsLabel} tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={42} allowDataOverflow />
          <YAxis tick={{ fontSize: 11 }} domain={[0, (max: number) => Math.max(1, max, edgeMax) * 1.12]} tickFormatter={fmt2} allowDecimals />
          <Tooltip labelFormatter={(x) => tsLabel(+x)} formatter={(v) => `${fmt2(+(v as number))} ${ctx.unit}`} />
          {edges.map((v, i) => <ReferenceLine key={i} y={v} stroke={ZONE_LINE_COLORS[i]} strokeDasharray="4 4" label={{ value: String(v), position: "insideTopRight", fontSize: 10, fill: ZONE_LINE_COLORS[i] }} />)}
          {lines.map((l) => (
            <Line key={l.key} type="linear" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} strokeDasharray={l.dash} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
