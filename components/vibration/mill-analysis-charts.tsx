"use client";

import * as React from "react";
import { MILL_RPM, millIso, millPoints, millStopped, rangeDays, type AnalysisDevice, type AnalysisRecord } from "@/lib/vibration/analysis";
import { MaTable, dmyDate } from "./analysis-shared";
import { MillTrendChart } from "./mill-analysis-trend";
import { AXIS_COLOR, bearingRole, fmt2, xyzLast, type MillCtx, type TrendLine } from "./mill-analysis-shared";

const BEARINGS = [1, 2, 3, 4, 5, 6];

/** 6 biểu đồ theo gối của một máy (mill-analysis.js: .ma-charts). v/d: 3 đường X/Y/Z; t: một đường. */
export function MillBearingCharts({ device, rs, ctx }: { device: AnalysisDevice; rs: AnalysisRecord[]; ctx: MillCtx }) {
  return (
    <div className="ma-charts">
      {BEARINGS.map((b, i) => {
        const pp = millPoints(rs, b, ctx.metric, ctx.axis);
        const last = pp.at(-1);
        const prev = pp.at(-2);
        const rise = last && prev && prev.value > 0 ? (last.value / prev.value - 1) * 100 : null;
        const lines: TrendLine[] = ctx.metric === "t"
          ? [{ key: "t", name: "Nhiệt độ", color: AXIS_COLOR.X, bearing: b, metric: "t", axis: "max" }]
          : ["X", "Y", "Z"].map((a) => ({ key: a, name: "Phương " + a, color: AXIS_COLOR[a], bearing: b, metric: ctx.metric, axis: a }));
        const xyz = ctx.metric === "t" ? [] : xyzLast(rs, b, ctx.metric);
        const absent = ctx.metric !== "t" ? lines.filter((l) => !millPoints(rs, b, ctx.metric, l.axis).length).map((l) => l.axis) : [];
        return (
          <article key={b} className="panel">
            <h3>Gối #{b} · {bearingRole(i)}</h3>
            <small>{MILL_RPM[i]} RPM · 1X = {fmt2(MILL_RPM[i] / 60)} Hz · 2X = {fmt2(MILL_RPM[i] / 30)} Hz</small>
            {ctx.metric !== "t" && (
              <div className="ma-axis-legend">
                {["X", "Y", "Z"].map((a) => <span key={a}><i style={{ background: AXIS_COLOR[a] }} />{a}{absent.includes(a) ? " · chưa đo" : ""}</span>)}
              </div>
            )}
            <MillTrendChart rs={rs} lines={lines} ctx={ctx} device={device} isoBearing={b} height={200} label={`Xu hướng gối #${b}${ctx.metric === "t" ? "" : " theo 3 phương X, Y, Z"}, ${pp.length} lần đo hợp lệ`} />
            <p>
              {pp.length} lần đo · gần nhất{" "}
              {ctx.metric === "t" ? fmt2(last?.value) : <>{xyz.map((p, k) => <React.Fragment key={p.a}>{k ? " · " : ""}<span style={{ color: AXIS_COLOR[p.a] }}>{p.a} {p.v === null ? "—" : fmt2(p.v)}</span></React.Fragment>)} (lớn nhất {fmt2(last?.value)})</>}{" "}
              {ctx.unit}{last ? ` (${dmyDate(last.date)})` : ""} · {ctx.metric === "v" && ctx.rms ? "Vùng " + millIso(last?.value ?? null, device, b, ctx.rms).zone : "Chưa phân vùng"}{rise !== null ? ` · thay đổi ${fmt2(rise)}%` : ""}
            </p>
          </article>
        );
      })}
    </div>
  );
}

/** Bảng trend đầy đủ khoảng chọn (mọi gối). */
export function MillFullTrendTable({ rs, ctx }: { rs: AnalysisRecord[]; ctx: MillCtx }) {
  return (
    <MaTable>
      <thead><tr><th>Ngày ca</th><th>Giờ đo</th>{BEARINGS.map((b) => <th key={b}>Gối #{b}</th>)}<th>Ghi chú</th></tr></thead>
      <tbody>
        {rangeDays(ctx.from, ctx.to).flatMap((day) => {
          const rr = rs.filter((r) => r.date === day);
          return (rr.length ? rr : [null]).map((r, i) => (
            <tr key={day + i}>
              <td>{dmyDate(day)}</td><td>{r?.measureTime || "—"}</td>
              {BEARINGS.map((b) => <td key={b}>{r ? fmt2(millPoints([r], b, ctx.metric, ctx.axis)[0]?.value) : "—"}</td>)}
              <td>{r ? (millStopped(r) ? "Máy ngừng — không phân tích" : r.note || "") : "Không có số đo"}</td>
            </tr>
          ));
        })}
      </tbody>
    </MaTable>
  );
}
