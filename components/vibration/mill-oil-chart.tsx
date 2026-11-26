"use client";

import * as React from "react";
import { useQueries } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";
import { addDays, cellNumber } from "@/lib/vibration/parse";
import type { VibrationDeviceDto, VibrationRecordDto } from "@/lib/vibration/types";
import { dmy, OIL_HIGH, OIL_LOW } from "./mill-utils";

const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#8b5cf6", "#d4a106", "#0891b2"];
const DAYS = 14;
const bad = (v: number) => v < OIL_LOW || v > OIL_HIGH;

/** Xu hướng dầu VRL 2 tuần (khối `.mill-oil-trend` của bản cũ): mỗi máy một đường, nét đứt từ máy thứ 7. Dùng chung cache với useVibrationRecords. */
export function MillOilChart({ date, devices }: { date: string; devices: VibrationDeviceDto[] }) {
  const dates = React.useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(date, i - DAYS + 1)), [date]);
  const results = useQueries({
    queries: dates.map((d) => {
      const params = { kind: "MILL" as const, date: d };
      return {
        queryKey: ["vibration-records", params],
        queryFn: () =>
          apiGet<VibrationRecordDto[]>(`/api/vibration/records?kind=MILL&date=${d}`).then((r) => ({
            records: r.data,
            previous: (r.meta?.previous ?? {}) as Record<string, VibrationRecordDto>,
          })),
      };
    }),
  });

  const series = devices.map((dev, k) => ({
    dev,
    c: COLORS[k % 6],
    dash: k >= 6 ? "6 4" : "",
    pts: dates.flatMap((dt, i) => {
      const rec = results[i].data?.records.find((r) => r.deviceId === dev.id && r.millData?.oil != null && r.millData.oil !== "");
      const v = rec ? cellNumber(rec.millData?.oil) : null;
      return v == null ? [] : [{ dt, v }];
    }),
  }));
  const all = series.flatMap((s) => s.pts.map((p) => p.v));

  const W = 760, H = 260, L = 40, R = 12, T = 12, B = 30;
  const y0 = Math.min(1, ...all) - 0.2;
  const y1 = Math.max(3.5, ...all) + 0.2;
  const X = (dt: string) => L + (dates.indexOf(dt) / (dates.length - 1)) * (W - L - R);
  const Y = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const ticks = [1, 1.5, 2, 2.5, 3, 3.5].filter((v) => v >= y0 && v <= y1);

  return (
    <div className="panel mill-oil-trend">
      <div className="rs-preview-head"><strong>Xu hướng tiêu hao dầu VRL 2 tuần · {dmy(dates[0])} – {dmy(date)}</strong></div>
      {!all.length ? (
        <p className="rs-empty">Chưa có số dầu VRL trong 2 tuần này.</p>
      ) : (
        <>
          <svg className="mill-oil-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tiêu hao dầu VRL 14 ngày">
            <rect x={L} y={Y(OIL_HIGH)} width={W - L - R} height={Y(OIL_LOW) - Y(OIL_HIGH)} className="mill-oil-ok" />
            {ticks.map((v) => (
              <React.Fragment key={v}>
                <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className={v === OIL_LOW || v === OIL_HIGH ? "mill-oil-lim" : "mill-oil-grid"} />
                <text x={L - 6} y={Y(v) + 4} textAnchor="end" className="mill-oil-ax">{v}</text>
              </React.Fragment>
            ))}
            {dates.map((dt, i) => (
              <text key={dt} x={X(dt)} y={H - 10} textAnchor={i === dates.length - 1 ? "end" : i === 0 ? "start" : "middle"} className={`mill-oil-ax${dt === date ? " cur" : ""}`}>
                {dt.slice(8)}/{dt.slice(5, 7)}
              </text>
            ))}
            {series.map((s) =>
              s.pts.length ? (
                <React.Fragment key={s.dev.id}>
                  <polyline points={s.pts.map((p) => `${X(p.dt)},${Y(p.v)}`).join(" ")} fill="none" stroke={s.c} strokeWidth={2.2} strokeDasharray={s.dash || undefined} />
                  {s.pts.map((p) => (
                    <circle key={p.dt} cx={X(p.dt)} cy={Y(p.v)} r={bad(p.v) ? 4.5 : 3.2} fill={bad(p.v) ? "#dc2626" : s.c} stroke={s.c}>
                      <title>{`${s.dev.name} · ${dmy(p.dt)}: ${p.v} cm${bad(p.v) ? " — ngoài 1.5–3 cm" : ""}`}</title>
                    </circle>
                  ))}
                </React.Fragment>
              ) : null
            )}
          </svg>
          <div className="rs-legend">
            {series.map((s) => (
              <span key={s.dev.id}>
                <i className="rs-key" style={{ background: s.c }} />
                {s.dev.name.replace(/^Máy nghiền /, "")}
                {s.dash ? " (nét đứt)" : ""}
              </span>
            ))}
            <span><i className="rs-key mill-oil-key ok" />Dải 1.5–3 cm</span>
            <span>Rê chuột vào điểm để xem số.</span>
          </div>
        </>
      )}
    </div>
  );
}
