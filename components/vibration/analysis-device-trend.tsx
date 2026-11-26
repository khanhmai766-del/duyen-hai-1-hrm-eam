"use client";

import * as React from "react";
import { BEARINGS, bearingValues, qualityCheck, rgName } from "@/lib/vibration/analysis";
import type { AnalysisDevice, AnalysisRecord } from "@/lib/vibration/analysis/types";
import { Foot, Sec, fmtN } from "./analysis-shared";

const W = 460;
const H = 170;

/** Mục 6 — Xu hướng max vận tốc từng gối (vibration-analysis.js:trendSection): vẽ SVG như web cũ. */
export function TrendSection({ d, recs, res }: { d: AnalysisDevice; recs: AnalysisRecord[]; res: any }) {
  const plan = res.plan;
  const pts = React.useMemo(() => recs.map((r) => ({ r, q: qualityCheck(d, r, null, plan.f1x) })).filter((p) => !p.q.stopped), [d, recs, plan.f1x]);
  if (pts.length < 2) return <Sec title="6. Xu hướng"><p>Chưa đủ 2 lần đo đang chạy để vẽ xu hướng.</p></Sec>;
  const t = pts.map((p) => Date.parse(p.r.date as string));
  const lo = Math.min(...t);
  const hi = Math.max(...t);
  const x = (v: number) => 40 + (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * (W - 55);
  const charts = BEARINGS.map((b) => {
    const vals = pts.map((p) => bearingValues(p.q, b).v as number | null);
    const row = res.bearings.find((y: any) => y.b.key === b.key);
    const ev = row?.evals.find((e: any) => e.ev.role === "chính" && e.rg);
    const lines: [string, number][] = ev ? Object.entries<number>(ev.rg) : [];
    const top = Math.max(1, ...vals.filter((v): v is number => v != null), ...lines.map((l) => l[1])) * 1.1;
    const y = (v: number) => H - 25 - (v / top) * (H - 40);
    if (!vals.some((v) => v != null)) return null;
    let path = "";
    let on = false;
    vals.forEach((v, i) => {
      if (v == null) { on = false; return; }
      path += (on ? "L" : "M") + x(t[i]).toFixed(1) + "," + y(v).toFixed(1);
      on = true;
    });
    return (
      <figure className="an-chart" key={b.key}>
        <figcaption>{b.label} · max X/Y mm/s{ev ? " · " + ev.ev.label : ""}</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Xu hướng ${b.label}`}>
          {lines.map(([k, v]) => (
            <React.Fragment key={k}>
              <line x1={40} x2={W - 15} y1={y(v)} y2={y(v)} className="lim" />
              <text x={W - 15} y={y(v) - 3} textAnchor="end" className="lim-t">{rgName(k)} {fmtN(v)}</text>
            </React.Fragment>
          ))}
          {row?.base != null && (
            <>
              <line x1={40} x2={W - 15} y1={y(row.base)} y2={y(row.base)} className="base" />
              <text x={44} y={y(row.base) - 3} className="base-t">nền {fmtN(row.base, 2)}</text>
            </>
          )}
          <line x1={40} x2={40} y1={10} y2={H - 25} className="axis" />
          <text x={34} y={y(0)} textAnchor="end" className="ax-t">0</text>
          <text x={34} y={y(top / 1.1) + 4} textAnchor="end" className="ax-t">{fmtN(top / 1.1)}</text>
          <path d={path} className="series" />
          {vals.map((v, i) => v == null ? null : (
            <circle key={i} cx={x(t[i]).toFixed(1)} cy={y(v).toFixed(1)} r={pts[i].r === res.r ? 4.5 : 3} className={pts[i].r === res.r ? "pt cur" : "pt"}>
              <title>{pts[i].r.date}: {fmtN(v)} mm/s</title>
            </circle>
          ))}
          <text x={40} y={H - 8} className="ax-t">{pts[0].r.date}</text>
          <text x={W - 15} y={H - 8} textAnchor="end" className="ax-t">{pts[pts.length - 1].r.date}</text>
        </svg>
      </figure>
    );
  });
  return (
    <Sec title="6. Xu hướng theo gối (máy đang chạy)">
      <div className="an-charts">{charts}</div>
      <Foot>Đường ngang: ranh giới của tiêu chuẩn chính và mức nền. Điểm to là lần đo đang xem. Ô lỗi dữ liệu không vẽ.</Foot>
    </Sec>
  );
}
