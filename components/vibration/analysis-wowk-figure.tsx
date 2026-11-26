"use client";

import * as React from "react";
import { WOWK_CHART_VI } from "@/lib/vibration/analysis/wowk";
import { fmtN } from "@/lib/vibration/analysis/util";

// Khung vẽ chính xác của ảnh gốc Hình 5 (wowk-analysis.js:WOWK_PLOT) — chỉ phủ dấu điểm đo, không vẽ lại biểu đồ gốc.
const PLOT = { x: 168, yBottom: 1171, xDecade: 458.5, yDecade: 462, minHz: 1, maxHz: 1000, minIn: 0.01, maxIn: 1.45 };

export interface FigurePoint { f: number | null | undefined; vInPk: number; zone?: string | null; label?: string }

/** wowkChartFigure(): ảnh Machine Dynamics 1989 + dấu điểm đo SVG. */
export function WowkFigure({ points = [] }: { points?: FigurePoint[] }) {
  const omitted: string[] = [];
  const marks = points.map((p, i) => {
    const f = Number(p.f), v = Number(p.vInPk);
    if (!Number.isFinite(f) || !Number.isFinite(v) || f < PLOT.minHz || f > PLOT.maxHz || v < PLOT.minIn || v > PLOT.maxIn) { omitted.push(p.label || `Điểm ${i + 1}`); return null; }
    const x = PLOT.x + Math.log10(f) * PLOT.xDecade;
    const y = PLOT.yBottom - Math.log10(v / PLOT.minIn) * PLOT.yDecade;
    const label = `${i + 1}. ${p.label || "Điểm đo"} · ${fmtN(f, 1)} Hz · ${fmtN(v, 3)} in/s pk · ${(p.zone && WOWK_CHART_VI[p.zone]) || p.zone || "chưa xếp vùng"}`;
    return (
      <g key={i} className="wk-live-marker" tabIndex={0} role="img" aria-label={label}>
        <title>{label}</title>
        <circle className="wk-marker-pulse" cx={x.toFixed(1)} cy={y.toFixed(1)} r="13" />
        <circle className="wk-marker-core" cx={x.toFixed(1)} cy={y.toFixed(1)} r="6" />
        <text x={(x + 9).toFixed(1)} y={(y - 9).toFixed(1)}>{i + 1}</text>
      </g>
    );
  });
  const any = marks.some(Boolean);
  return (
    <figure className="wk-chart-original">
      <div className="wk-chart-stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/vibracontrol/wowk-figure-5.png" alt="Biểu đồ gốc Vibration Limits for Bearing Cap Measurements, Machine Dynamics, August 1989" />
        <svg className="wk-chart-markers" viewBox="0 0 1734 1320" aria-label="Điểm đo trên biểu đồ">{marks}</svg>
      </div>
      {any && <p className="wk-marker-key"><i></i> Điểm đo đang phân tích</p>}
      {omitted.length > 0 && <p className="wk-chart-outside">{omitted.join(" · ")}: ngoài khung Hình 5, không thể hiện trên biểu đồ.</p>}
    </figure>
  );
}
