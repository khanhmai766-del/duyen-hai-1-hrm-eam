"use client";

import * as React from "react";
import { QN, QUALITY_QS, isoWeek, qualityStats, type QualityBucket } from "@/lib/vibration/analysis";
import { fmtN, type AnalysisTabProps } from "./analysis-shared";

function StatTable({ data, head, byWeek }: { data: Record<string, QualityBucket>; head: string; byWeek: boolean }) {
  const rows = Object.entries(data).sort((a, b) => (byWeek ? b[0].localeCompare(a[0]) : b[1].bad / b[1].total - a[1].bad / a[1].total));
  return (
    <table className="an-table">
      <thead>
        <tr><th>{head}</th><th>Số lần đo</th><th>Ô có số</th><th>Ô bị cờ</th><th>Tỉ lệ</th>{QUALITY_QS.map((q) => <th key={q} title={QN[q]}>{q}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map(([k, v]) => {
          const p = (v.bad / v.total) * 100;
          return (
            <tr key={k}>
              <th>{k}</th><td>{v.recs}</td><td>{v.total}</td><td>{v.bad}</td>
              <td><span className="q-bar" style={{ "--p": `${Math.min(100, p * 4)}%` } as React.CSSProperties}>{fmtN(p, 1)} %</span></td>
              {QUALITY_QS.map((q) => <td key={q}>{v.per[q] || ""}</td>)}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Tab "Chất lượng số liệu" (vibration-analysis.js:qualityView). */
export function AnalysisQualityTab({ devices, archived, setArchived }: AnalysisTabProps) {
  const [area, setArea] = React.useState("");
  const areas = React.useMemo(() => [...new Set(devices.filter((d) => d.records.some((r) => r.date)).map((d) => d.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi")), [devices]);
  const stats = React.useMemo(() => qualityStats(devices.filter((d) => !area || d.area === area), isoWeek), [devices, area]);
  return (
    <>
      <div className="table-toolbar">
        <select id="anArea" value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">Tất cả cương vị</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <label><input type="checkbox" id="anArchived" checked={!!archived} onChange={(e) => setArchived?.(e.target.checked)} /> Cả thiết bị lịch sử</label>
      </div>
      <p className="an-foot">{QUALITY_QS.map((q, i) => <React.Fragment key={q}>{i > 0 && " · "}<b>{q}</b> {QN[q]}</React.Fragment>)}</p>
      <p className="an-foot">Chỉ số chất lượng số liệu theo đặc tả mục 4: tỉ lệ ô bị cờ (giải mã ngày/giờ Q1, lẫn đơn vị Q4, đảo cột Q5, thiếu dấu thập phân Q6, phi lý Q10) trên số ô có số, theo tuần và theo người nhập. Từ 13/08/2026 có 5–15 % ô bị lỗi.</p>
      <div className="an-two">
        <div><h3>Theo tuần</h3><StatTable data={stats.byWeek} head="Tuần" byWeek /></div>
        <div><h3>Theo người nhập</h3><StatTable data={stats.byPerson} head="Người đo" byWeek={false} /></div>
      </div>
    </>
  );
}
