"use client";

import * as React from "react";
import { LEVELS, LEVEL_ACTIONS, STD_SHORT, actionPlan, latestResult, rgName, type Level } from "@/lib/vibration/analysis";
import { VC_META } from "@/lib/vibration/analysis/core";
import { LevelBadge, fmtN, vnDate, type AnalysisTabProps } from "./analysis-shared";
import Link from "next/link";
import { analysisHref } from "./analysis-links";

const Small = ({ children }: { children: React.ReactNode }) => <small>{children}</small>;

/** Các ô nội dung của một dòng (dùng chung cho bảng desktop và thẻ điện thoại). */
function rowParts(x: any, tempRise: number) {
  const w = x.worst;
  const me = w?.evals.find((e: any) => e.ev.role === "chính" && !e.error);
  const hot = x.bearings.filter((b: any) => b.t != null).sort((a: any, b: any) => b.t - a.t)[0];
  const fl = x.q.flags.filter((f: any) => f.level !== "thong_tin");
  const st = x.level === "na" ? null : actionPlan(x)[0];
  return {
    level: <><LevelBadge level={x.level} />{x.unconfirmed && <Small>1 lần đo — cần đo lại</Small>}</>,
    std: x.plan.main
      ? <>{STD_SHORT[x.plan.main]}{x.plan.confirmed ? " ✓" : <Small>gợi ý, chưa xác nhận</Small>}</>
      : x.bearings.some((b: any) => b.evals.some((e: any) => e.kind === "wowk"))
        ? <>Tài liệu Wowk<Small>ISO chưa đủ thông tin</Small></>
        : <Small>Ngưỡng nội bộ</Small>,
    worst: w
      ? <><b>{w.b.label}</b> {fmtN(w.v)} mm/s<Small>{me ? me.text + (me.g ? " · bệ " + (me.g === "cung" ? "cứng" : "mềm") : "") : ""}{me?.near?.length ? " · sát " + me.near.map(rgName).join(", ") : ""}</Small></>
      : "—",
    base: w?.crit
      ? <>{w.crit.delta >= 0 ? "+" : ""}{fmtN(w.crit.delta, 2)} mm/s{w.crit.dang_ke && <> <b>đáng kể</b></>}</>
      : <Small>{w?.baseMissing || "—"}</Small>,
    temp: hot ? <>{hot.b.label} {fmtN(hot.t, 0)} °C{hot.tRise && <> <b>↑ ≥ {tempRise} °C</b></>}</> : "—",
    quality: fl.length
      ? <><span className="q-count" data-bad={String(fl.some((f: any) => f.level === "loi"))}>{fl.length} cờ</span><Small>{[...new Set(fl.map((f: any) => f.q))].join(", ")}</Small></>
      : <Small>Không có cờ</Small>,
    hyp: x.hyps[0] ? <>{x.hyps[0].name}{x.hyps.length > 1 && <Small>+ {x.hyps.length - 1} khả năng khác</Small>}</> : <Small>—</Small>,
    todo: <>
      {x.level === "na" ? <Small>{x.levelText || "Không đủ số liệu"}</Small>
        : st ? <><b>{st[0]}</b><Small>{st[2]}</Small></>
        : LEVEL_ACTIONS[x.level][0]}
      {x.forecast && <Small>Xu hướng chạm «{x.forecast.name}» ≈ {x.forecast.date}</Small>}
    </>,
  };
}

const COLS = ["Ưu tiên", "Thiết bị", "Ngày đo", "Tiêu chuẩn chính", "Gối lớn nhất · kết quả", "So mức nền", "Nhiệt gối", "Chất lượng số liệu", "Giả thuyết hàng đầu (Yếu)", "Việc cần làm"];

export function AnalysisSummaryTab({ devices, settings, archived, setArchived }: AnalysisTabProps) {
  const [area, setArea] = React.useState("");
  const [onlyIssues, setOnlyIssues] = React.useState(true);
  // Tính một lần cho mọi thiết bị theo [devices, settings]
  const all = React.useMemo(() => devices.map((d) => latestResult(d, settings)).filter(Boolean) as any[], [devices, settings]);
  const areas = React.useMemo(() => [...new Set(devices.filter((d) => d.records.some((r) => r.date)).map((d) => d.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi")), [devices]);
  const rows = React.useMemo(
    () => all.filter((x) => !area || x.d.area === area).sort((a, b) => LEVELS[b.level as Level].rank - LEVELS[a.level as Level].rank || (b.worst?.v || 0) - (a.worst?.v || 0)),
    [all, area],
  );
  const counts = React.useMemo(() => {
    const c = {} as Record<Level, number>;
    for (const k of Object.keys(LEVELS) as Level[]) c[k] = rows.filter((x) => x.level === k).length;
    return c;
  }, [rows]);
  const noStd = rows.filter((x) => !x.plan.main).length;
  const shown = React.useMemo(() => (onlyIssues ? rows.filter((x) => LEVELS[x.level as Level].rank >= 2) : rows), [rows, onlyIssues]);
  const parts = React.useMemo(() => shown.map((x) => ({ x, p: rowParts(x, settings.tempRise) })), [shown, settings.tempRise]);
  const levelKeys = (Object.keys(LEVELS) as Level[]).filter((k) => k !== "na").reverse();

  return (
    <>
      <div className="table-toolbar">
        <select id="anArea" value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">Tất cả cương vị</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <label><input type="checkbox" id="anIssues" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Chỉ thiết bị cần chú ý (từ Theo dõi trở lên)</label>
        <label><input type="checkbox" id="anArchived" checked={!!archived} onChange={(e) => setArchived?.(e.target.checked)} /> Cả thiết bị lịch sử</label>
      </div>

      <div className="an-kpis">
        {levelKeys.map((k) => (
          <div key={k} className="an-kpi" data-level={k}><strong>{counts[k]}</strong><span>{LEVELS[k].label}</span></div>
        ))}
        <div className="an-kpi"><strong>{counts.na}</strong><span>Dừng / không đủ số liệu</span></div>
      </div>

      {noStd > 0 && (
        <p className="an-warn">
          ⚠ {noStd}/{rows.length} thiết bị chưa chọn được tiêu chuẩn phù hợp (thiếu thông số hoặc ngoài phạm vi) → tạm dùng <b>ngưỡng rung riêng của thiết bị</b>. Khi khai báo đủ thông số máy, hệ thống tự so với bảng tiêu chuẩn áp dụng; giá trị tạm không bị ghi đè. Khai báo ở <b>Cấu hình vùng đo › Thông số máy</b>.
        </p>
      )}

      <div className="an-table-wrap">
        <table className="an-table an-summary">
          <thead><tr>{COLS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {parts.map(({ x, p }) => (
              <tr key={x.d.id}>
                <td>{p.level}</td>
                <td>
                  <Link className="text-button" href={analysisHref(x.d.id, x.r.date, archived)}>{x.d.name}</Link>
                  <small>{x.d.area} / {x.d.system}</small>
                </td>
                <td>{vnDate(x.r.date)}</td>
                <td>{p.std}</td><td>{p.worst}</td><td>{p.base}</td><td>{p.temp}</td><td>{p.quality}</td><td>{p.hyp}</td><td>{p.todo}</td>
              </tr>
            ))}
            {!parts.length && <tr><td colSpan={10}>Không có thiết bị ở mức cần chú ý.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="an-foot">
        Đánh giá theo lần đo có ngày gần nhất của từng thiết bị. Bảng ngưỡng v{VC_META.schema} ({VC_META.ngay}). Phần mềm chỉ khuyến cáo — <b>quyết định dừng/chạy thuộc người có thẩm quyền vận hành</b> [HD mục 0].
      </p>
    </>
  );
}
