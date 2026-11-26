"use client";

import * as React from "react";
import { CAUSE_ACTIONS, FAN_ACTIONS, LEVELS, LEVEL_ACTIONS, STD_SHORT, actionPlan, analyzeRecord, machineTypes, type Level } from "@/lib/vibration/analysis";
import { VC_META } from "@/lib/vibration/analysis/core";
import { BearingSection } from "./analysis-device-bearings";
import { TrendSection } from "./analysis-device-trend";
import { CataloguePanel, Foot, LevelBadge, Sec, TableWrap, Warn, fmtN, resolveSelection, vnDate, type AnalysisTabProps, type CatalogueSel } from "./analysis-shared";

const Src = ({ children }: { children: React.ReactNode }) => <span className="src">{children}</span>;

// In: chỉ in khối #anReport (ẩn menu, bộ lọc, ...)
const PRINT_CSS = `@media print{body *{visibility:hidden}#anReport,#anReport *{visibility:visible}#anReport{position:absolute;left:0;top:0;width:100%}}`;

function Info({ k, children }: { k: string; children: React.ReactNode }) {
  return <div><small>{k}</small><b>{children}</b></div>;
}

function Section1({ res }: { res: any }) {
  const m = res.plan.machine;
  const f1x = res.plan.f1x;
  const type = machineTypes.find((t) => t[0] === m.type)?.[1] ?? "chưa khai báo";
  return (
    <Sec title="1. Thông tin máy và giả định">
      <div className="an-grid">
        <Info k="Loại máy / công suất / tốc độ">{type} · {m.powerKw ? fmtN(m.powerKw, 1) + " kW" : "? kW"} · {m.speedRpm ? m.speedRpm + " v/p" : "? v/p"}</Info>
        <Info k="Tần số quay 1X">{f1x ? fmtN(f1x, 2) + " Hz" : "chưa biết"}</Info>
        <Info k="Tiêu chuẩn chính">{res.plan.main ? STD_SHORT[res.plan.main] + (res.plan.confirmed ? " (PXVH1 đã xác nhận)" : " (gợi ý)") : "Chưa chọn được — dùng ngưỡng nội bộ"}</Info>
        <Info k="Kiểu bệ">{res.plan.foundations.map((g: string) => (g === "cung" ? "cứng" : "mềm")).join(" + ")}{res.plan.foundations.length > 1 ? " (chưa xác định)" : ""}</Info>
      </div>
      <ul className="an-notes">
        {res.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}
        <li>Vận tốc hiểu là mm/s RMS, biên độ là pk-pk (µm; ô ghi theo mm được nhận diện theo tần số tương đương). X/Y: {m.xAxis === "ngang" ? "X ngang, Y đứng" : m.xAxis === "dung" ? "X đứng, Y ngang" : "chưa rõ ngang/đứng"}.</li>
        <li>Chỉ có số tổng → mọi nguyên nhân tối đa mức khớp <b>Yếu</b>; cần đo phổ để xác định nguyên nhân [WOWK tr.4].</li>
      </ul>
    </Sec>
  );
}

function Section2({ res }: { res: any }) {
  return (
    <Sec title="2. Chất lượng số liệu (khối DM, Q1–Q10)">
      {res.q.flags.length ? (
        <>
          <ul className="an-flags">{res.q.flags.map((f: any, i: number) => <li key={i} data-level={f.level}><b>{f.q}</b> {f.msg}</li>)}</ul>
          <Foot>Ô &quot;lỗi&quot; không dùng để đánh giá. Giá trị giải mã chỉ để xem — không sửa vào dữ liệu gốc.</Foot>
        </>
      ) : <p>Không phát hiện lỗi số liệu.</p>}
    </Sec>
  );
}

function Section4({ res }: { res: any }) {
  return (
    <Sec title={'4. Giả thuyết nguyên nhân (khối HA — tối đa "Yếu")'}>
      {res.hyps.length ? res.hyps.map((h: any, i: number) => (
        <div key={h.id} className="hyp">
          <div className="hyp-h"><b>{i + 1}. {h.name}</b><span className="match">Mức khớp: Yếu{h.score > 1 ? ` · ${h.score} dấu hiệu` : ""}</span></div>
          <p><small>Dữ liệu:</small> {h.evidence}</p>
          <p><small>Tài liệu nói gì:</small> <Src>{h.src}</Src></p>
          <p><small>Kiểm tra xác nhận:</small> {h.check}</p>
          <p className="an-foot">Chỉ có số tổng — cần đo phổ để xác định nguyên nhân [WOWK tr.4].</p>
        </div>
      )) : <p>Chưa đủ dấu hiệu để nêu giả thuyết. Chưa đủ dữ liệu để xác định nguyên nhân [R6 phần mở đầu, Rule 1].</p>}
    </Sec>
  );
}

function Section5({ res }: { res: any }) {
  const lvl: Level = res.level;
  const fanEval = res.worst?.evals.find((e: any) => e.ev.role === "chính" && e.kind === "fan");
  const acts = [...new Set<string>(res.hyps.flatMap((h: any) => h.acts))].filter((k) => CAUSE_ACTIONS[k]);
  const plan = actionPlan(res);
  return (
    <Sec title="5. Khuyến cáo (khối AG)">
      {lvl !== "na" && (
        <div className="rec" data-level={lvl}>
          <b>{LEVELS[lvl].label}:</b> {LEVEL_ACTIONS[lvl][0]} <Src>{LEVEL_ACTIONS[lvl][1]}</Src>
          {fanEval && <p><small>Riêng mức rung tuyệt đối theo ISO 14694 (gối lớn nhất):</small> {FAN_ACTIONS[fanEval.fanIndex]} <Src>[R21 mục 8.4]</Src></p>}
          {res.why.length > 0 && <p><small>Mức hành động được nâng vì:</small></p>}
          {res.why.length > 0 && <ul>{res.why.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>}
        </div>
      )}
      {acts.length > 0 && (
        <TableWrap>
          <thead><tr><th>Nguyên nhân (HD mục 8.2)</th><th>Tạm thời để chạy tiếp</th><th>Khắc phục triệt để</th><th>Nghiệm thu</th><th>Nguồn</th></tr></thead>
          <tbody>{acts.map((k) => { const a = CAUSE_ACTIONS[k]; return <tr key={k}><th>#{k} {a[0]}</th><td>{a[1]}</td><td>{a[2]}</td><td>{a[3]}</td><td><Src>{a[4]}</Src></td></tr>; })}</tbody>
        </TableWrap>
      )}
      {plan.length > 0 && (
        <>
          <h4>Kế hoạch xử lý theo dữ liệu</h4>
          <TableWrap>
            <thead><tr><th>#</th><th>Bước</th><th>Làm gì</th><th>Thời hạn</th></tr></thead>
            <tbody>{plan.map(([t, w, dl], i) => <tr key={i}><td>{i + 1}</td><th>{t}</th><td>{w}</td><td>{dl}</td></tr>)}</tbody>
          </TableWrap>
          <Foot>Thứ tự: xác minh số liệu → kiểm tra không dừng máy → đo phân biệt → xử lý theo nguyên nhân đã xác nhận → nghiệm thu. Thời hạn theo mức hành động; dự báo xu hướng chỉ để lập kế hoạch.</Foot>
        </>
      )}
      {res.needs.length > 0 && <><h4>Cần đo / bổ sung thêm</h4><ul>{res.needs.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul></>}
      <p className="an-decision">Phần mềm chỉ khuyến cáo. <b>Quyết định dừng/chạy thuộc người có thẩm quyền vận hành</b> (trưởng ca, quản đốc) [HD mục 0; WOWK tr.9].</p>
    </Sec>
  );
}

/** Tab "Thiết bị trong danh mục" — phương pháp ISO (vibration-analysis.js:deviceView + trendSection). */
export function AnalysisDeviceTab({ devices, settings, sel, setSel, methodSwitch }: AnalysisTabProps & { sel: CatalogueSel; setSel: (s: CatalogueSel) => void; methodSwitch?: React.ReactNode }) {
  const { device: d, recs, record: r } = React.useMemo(() => resolveSelection(devices, sel), [devices, sel]);
  const res = React.useMemo(() => (d && r ? analyzeRecord(d, r, { history: recs, settings }) : null), [d, r, recs, settings]);

  const panel = (
    <CataloguePanel
      devices={devices} sel={sel} onChange={setSel} showDevice showDate
      extra={<button type="button" className="secondary-button an-filter-print" id="anPrint" onClick={() => window.print()}>In / lưu PDF</button>}
    >{methodSwitch}</CataloguePanel>
  );
  if (!d) return <>{panel}<p>Không có thiết bị có số liệu phù hợp bộ lọc.</p></>;
  if (!r || !res) return <>{panel}<p>Thiết bị chưa có lần đo có số liệu.</p></>;

  const head = (
    <div className="an-head">
      <div>
        <h2>{d.name}</h2>
        <p>{d.area} / {d.system} · {d.id} · Lần đo {vnDate(r.date)}{r.measureTime ? " " + r.measureTime : ""} · Người đo: {r.person || "không ghi"}</p>
      </div>
      <LevelBadge level={res.level} />
    </div>
  );

  return (
    <>
      <style>{PRINT_CSS}</style>
      {panel}
      <div id="anReport">
        {head}
        {res.level === "na" && res.q.stopped ? (
          <Warn>Máy dừng / dự phòng ở lần đo này → không đánh giá (HD mục 5 mục 7). Chọn lần đo khác.</Warn>
        ) : (
          <>
            <Section1 res={res} />
            <Section2 res={res} />
            <BearingSection res={res} deviceId={d.id} baselineFrom={d.analysis?.baselineFrom || ""} />
            <Section4 res={res} />
            <Section5 res={res} />
          </>
        )}
        <TrendSection d={d} recs={recs} res={res} />
        {!(res.level === "na" && res.q.stopped) && <Foot>Bảng ngưỡng v{VC_META.schema} ({VC_META.ngay}) · Lõi tính toán đối chiếu test tham chiếu 17/17.</Foot>}
      </div>
    </>
  );
}
