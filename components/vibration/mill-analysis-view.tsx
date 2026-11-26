"use client";

import * as React from "react";
import { useAnalysisDataset } from "@/hooks/useVibrationAnalysis";
import {
  MILL_NAME_FILTER, MILL_RPM, addDays, millAssessment, millBearingSeries, millClock, millIso, millLatestRecord, millPoints, millReferencePoint, millStopped, millUnitForArea,
  millWorstBearing, rangeDays, rangeRecords, recentRange, MILL_SHIFTS, millDateValid, type AnalysisDevice,
} from "@/lib/vibration/analysis";
import { cn } from "@/lib/utils";
import { MaTable, dmyDate } from "./analysis-shared";
import { MillBearingCharts, MillFullTrendTable } from "./mill-analysis-charts";
import { MillDayPanel, ZoneTag } from "./mill-analysis-day";
import { MillDetails, MillMethodDetails, MillZoneGuide, ZONE_BADGE } from "./mill-analysis-guide";
import { BEARING_COLORS, axisLabel, fmt2, metricUnit, type MillCtx, type MillMetric, type TrendLine } from "./mill-analysis-shared";
import { MillTrendChart } from "./mill-analysis-trend";
import { useSearchParams } from "next/navigation";


/** Trang "Phân tích độ rung MILL" (mill-analysis.js: draw). Theo máy nghiền / từng gối / 3 phương; ngày ca theo giờ Việt Nam. */
export function MillAnalysisView() {
  const { data, isLoading, error } = useAnalysisDataset("mill");
  const init = React.useMemo(() => recentRange(), []);
  const params = useSearchParams();
  const paramDay = params.get("date") ?? "";
  const [day, setDay] = React.useState(() => (millDateValid(paramDay) ? paramDay : millClock().date));
  const [from, setFrom] = React.useState(init.from);
  const [to, setTo] = React.useState(init.to);
  const paramDevice = params.get("device") ?? "";
  const [selected, setSelected] = React.useState(paramDevice);
  const [metric, setMetric] = React.useState<MillMetric>("v");
  const [axis, setAxis] = React.useState("max");
  const [rms, setRms] = React.useState(true);
  const [focus, setFocus] = React.useState(-1); // -1 = tất cả 6 gối
  // Liên kết sâu ?device=<id|mã cũ>[&date=YYYY-MM-DD] — theo cả khi bấm Link ngay trên trang này.
  const appliedKey = React.useRef(`${paramDevice}|${paramDay}`);
  React.useEffect(() => {
    const k = `${paramDevice}|${paramDay}`;
    if (appliedKey.current === k) return;
    appliedKey.current = k;
    if (paramDevice) { setSelected(paramDevice); setFocus(-1); }
    if (millDateValid(paramDay)) setDay(paramDay);
    window.scrollTo(0, 0);
  }, [paramDevice, paramDay]);

  const devices = React.useMemo<AnalysisDevice[]>(
    () => (data?.devices ?? []).filter((d) => MILL_NAME_FILTER.test(d.name) && millUnitForArea(d.area)).sort((a, b) => a.name.localeCompare(b.name)),
    [data],
  );
  const device = devices.find((d) => d.id === selected) ?? devices.find((d) => d.legacyId === selected) ?? devices[0];
  const rs = React.useMemo(() => (device ? rangeRecords(device, from, to) : []), [device, from, to]);
  const unit = metricUnit(metric);
  const ctx: MillCtx = { day, from, to, metric, axis, rms, unit };

  const Title = <div className="page-title-row"><h1 id="title">Phân tích độ rung MILL</h1></div>;
  if (isLoading) return <>{Title}<p className="ma-note">Đang tải số liệu MILL…</p></>;
  if (error || !data) return <>{Title}<p className="an-warn">Không tải được số liệu: {(error as Error)?.message ?? "lỗi không xác định"}</p></>;

  const setDate = (v: string, f: (s: string) => void, ok: (s: string) => boolean) => { if (millDateValid(v) && ok(v)) f(v); };

  // Thẻ tổng quan: lần đo gần nhất có số của từng máy (≤ ngày phân tích)
  const cards = devices.map((x) => {
    const latest = millLatestRecord(x, day);
    const pp = latest ? Array.from({ length: 6 }, (_, i) => millPoints([latest], i + 1, "v", "max")).flat() : [];
    const mx = pp.length ? Math.max(...pp.map((p) => p.value)) : null;
    const zone = rms ? millIso(mx, x, 1, rms).zone : "RMS?";
    return { x, latest, mx, zone };
  });

  const aRec = device ? millLatestRecord(device, day) : null;
  const aDay = aRec?.date || day;
  const worst = device ? millWorstBearing(device, aDay) : 1;
  const all = focus === -1;
  const bearing = all ? worst : focus || worst;
  const result = device ? millAssessment(device, aDay, bearing, rms) : null;
  const trendPts = device ? millPoints(rs, bearing, metric, axis) : [];
  const shiftName = (s: string | null | undefined) => MILL_SHIFTS.find((z) => z.id === s)?.name || "";
  const sixLines: TrendLine[] = [1, 2, 3, 4, 5, 6].map((b, i) => ({ key: "b" + b, name: `Gối #${b} · ${MILL_RPM[i]} RPM`, color: BEARING_COLORS[i], bearing: b, metric, axis, dash: i >= 3 ? "6 3" : undefined }));
  const oneLines: TrendLine[] = [{ key: "b" + bearing, name: `Gối #${bearing}`, color: BEARING_COLORS[0], bearing, metric, axis }];
  const series = device ? millBearingSeries(rs, metric, axis) : [];
  const iso = device && result ? millIso(result.last?.value ?? 0, device, bearing, rms) : null;

  return (
    <>
      {Title}
      <div id="content"><section className="ma-page">
      <div className="panel ma-toolbar">
        <label>Ngày phân tích<input id="maDay" type="date" value={day} onChange={(e) => setDate(e.target.value, setDay, () => true)} /></label>
        <label>Xu hướng từ ngày<input id="maFrom" type="date" value={from} max={to} onChange={(e) => setDate(e.target.value, setFrom, (v) => v <= to)} /></label>
        <label>Đến ngày<input id="maTo" type="date" value={to} min={from} onChange={(e) => setDate(e.target.value, setTo, (v) => v >= from)} /></label>
        <button id="ma30Days" type="button" className="secondary-button" onClick={() => { const r = recentRange(); setFrom(r.from); setTo(r.to); }}>30 ngày gần nhất</button>
        <label>Máy nghiền
          <select id="maDevice" value={device?.id ?? ""} onChange={(e) => { setSelected(e.target.value); setFocus(-1); }}>{devices.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.area}</option>)}</select></label>
        <label>Thông số
          <select id="maMetric" value={metric} onChange={(e) => setMetric(e.target.value as MillMetric)}><option value="v">Vận tốc rung (mm/s)</option><option value="d">Biên độ rung (µm)</option></select></label>
        <label>Hướng đo
          <select id="maAxis" value={axis} onChange={(e) => setAxis(e.target.value)}>{["max", "X", "Y", "Z"].map((v) => <option key={v} value={v}>{v === "max" ? "Lớn nhất X/Y/Z" : v}</option>)}</select></label>
        <label><input id="maRms" type="checkbox" checked={rms} onChange={(e) => setRms(e.target.checked)} /> Xác nhận vận tốc đo là RMS</label>
      </div>
      <p className="ma-note">Phân tích theo ngày ca (UTC+7) · Xu hướng {dmyDate(from)} – {dmyDate(to)} ({rangeDays(from, to).length} ngày) · Trend bỏ ngày ngừng/trống, nối lần đo hợp lệ · Giữ số 0.</p>

      <MillZoneGuide />

      <div className="ma-overview">
        {cards.map(({ x, latest, mx, zone }) => {
          const chosen = x.id === device?.id;
          return (
            <button key={x.id} type="button" className={cn("panel", chosen && "ma-selected")} data-ma-id={x.id} data-zone={zone} aria-pressed={chosen} onClick={() => { setSelected(x.id); setFocus(-1); }}>
              <strong>{x.name.replace("Máy nghiền ", "MILL ")}</strong>
              <span className="ma-card-reading">{fmt2(mx)} mm/s · {zone}</span>
              <small>{latest ? `${latest.date === day ? "Hôm chọn" : "Gần nhất"} ${dmyDate(latest.date).slice(0, 5)} · ${shiftName(latest.shift)}` : "Chưa có số đo"}</small>
              {chosen && <span className="ma-card-selected">✓ Đang chọn</span>}
            </button>
          );
        })}
      </div>

      {!device || !result ? <p>Không có máy nghiền được phép xem.</p> : (
        <>
          <section className="panel ma-assessment">
            <MillDayPanel device={device} rs={rs} ctx={ctx} />
          <div className="ma-insight">
            <div className="ma-toolbar">
              <h3>Giả thuyết · Khuyến cáo · Xu hướng</h3>
              <label>Gối theo dõi
                <select id="maCauseBearing" value={focus} onChange={(e) => setFocus(+e.target.value)}>
                  <option value={-1}>Tất cả 6 gối</option>
                  {[1, 2, 3, 4, 5, 6].map((b) => <option key={b} value={b}>Gối #{b}{b === worst ? " · cao nhất lần đo gần nhất" : ""}</option>)}
                </select></label>
            </div>
            {iso && <p>ISO 20816-3:2022 · {iso.group ? "Nhóm " + iso.group : "chưa phân nhóm"} · đánh giá có điều kiện. {iso.limits ? `A/B ${iso.limits["A/B"]} · B/C ${iso.limits["B/C"]} · C/D ${iso.limits["C/D"]} mm/s RMS. ` : ""}{iso.notes.join(" · ")}. SCCN dùng cho tốc độ gối và hướng kiểm tra; không thay thế xác minh cấu hình máy.</p>}
            <p>
              {all
                ? `Xu hướng chung 6 gối, mỗi đường giữ riêng số đo của đúng gối. Nguyên nhân và khuyến cáo dưới đây xét gối #${bearing} có vận tốc cao nhất ${aRec && aDay !== day ? `ở lần đo gần nhất ${dmyDate(aDay)} (ngày chọn ${dmyDate(day)} chưa có số đo)` : "ngày chọn"}; tốc độ từng gối không giống nhau.`
                : `Vận tốc lớn nhất X/Y/Z tại một gối cố định #${bearing} · ${MILL_RPM[bearing - 1]} RPM. Mặc định gối có rung cao nhất ngày chọn (nếu chưa đo: gối 1); không ghép các gối khác nhau thành một chuỗi.`}
              {aRec && aDay !== day && !all && <><br /><b>Ngày chọn {dmyDate(day)} chưa có số đo — giả thuyết, khuyến cáo và xu hướng theo lần đo gần nhất {dmyDate(aDay)} · {shiftName(aRec.shift)}.</b></>}
            </p>
            <div className="ma-insight-grid">
              <article>
                <h3>Xu hướng độ rung</h3>
                <p>{result.trend}{result.ratio !== null ? ` · ${fmt2((result.ratio - 1) * 100)}%` : ""}.</p>
                <p>{result.last ? (result.last.date === day ? "Ngày chọn" : "Lần đo gần nhất " + dmyDate(result.last.date)) : "Ngày chọn"}: <b>{fmt2(result.last?.value)} mm/s</b>{result.prev ? ` · lần trước ${dmyDate(result.prev.date)}: ${fmt2(result.prev.value)} mm/s` : ""}. {rms ? "Vùng ISO " + result.zone : "Chưa xác nhận RMS — chưa phân vùng"}.</p>
              </article>
              <article><h3>Khuyến cáo</h3><p>{result.advice}</p></article>
            </div>
            <h3>Giả thuyết nguyên nhân — chưa xác nhận</h3>
            {result.causes.length ? (
              <MaTable>
                <thead><tr><th>Giả thuyết</th><th>Bằng chứng hiện có / giới hạn</th><th>Cách kiểm chứng</th></tr></thead>
                <tbody>{result.causes.map((c) => <tr key={c.name}><td>{c.name}<small>Độ tin cậy thấp</small></td><td>{c.evidence}</td><td>{c.check}</td></tr>)}</tbody>
              </MaTable>
            ) : <p>{result.last ? "Chưa có tín hiệu tăng/vượt mức để ưu tiên một nguyên nhân từ số tổng. Không loại trừ lỗi khi chưa có FFT." : "Chưa có lần đo nào có số (đến ngày chọn) — chưa đưa giả thuyết lỗi cho máy."}</p>}

            <h3>Xu hướng {dmyDate(from)} – {dmyDate(to)} · {all ? "Tất cả 6 gối" : "Gối #" + bearing} · {axisLabel(axis)} ({unit})</h3>
            {all ? (
              <>
                <div className="ma-six-summary">
                  {series.map((s, i) => {
                    const first = s.points[0], last = s.points.at(-1), delta = first && last ? last.value - first.value : null;
                    return (
                      <article key={s.bearing} style={{ borderLeft: `4px solid ${BEARING_COLORS[i]}` }}>
                        <strong>Gối #{s.bearing} <small>{MILL_RPM[i]} RPM</small></strong>
                        <b>{fmt2(last?.value)} <small>{unit}</small></b>
                        <span>Cuối kỳ · {last ? dmyDate(last.date) : "Chưa đo"}</span>
                        <small>Max: {fmt2(s.points.length ? Math.max(...s.points.map((p) => p.value)) : null)} · Δ đầu/cuối: {delta === null ? "—" : (delta > 0 ? "+" : "") + fmt2(delta)} {unit}</small>
                        <small>{s.points.length} lần đo hợp lệ</small>
                      </article>
                    );
                  })}
                </div>
                <p className="ma-note">Mỗi màu là một gối cố định; đường đứt = gối 4–6 (139 RPM). Bỏ ngày ngừng/trống và nối các lần chạy gần nhất; giữ số 0. Δ là chênh lệch tuyệt đối đầu/cuối khoảng chọn, không phải kết luận lỗi.</p>
                <MillTrendChart rs={rs} lines={sixLines} ctx={ctx} device={device} height={260} label={`Xu hướng chung 6 gối, ${unit}`} />
              </>
            ) : <MillTrendChart rs={rs} lines={oneLines} ctx={ctx} device={device} isoBearing={bearing} height={240} label={`Xu hướng gối #${bearing}, ${trendPts.length} lần đo hợp lệ`} />}
            <MillDetails summary={`Bảng trend khoảng chọn · ${all ? "chung 6 gối" : "Gối #" + bearing} · ${axisLabel(axis)} · ${unit}`}>
              <MaTable>
                <thead><tr><th>Ngày ca</th><th>Giờ đo</th>{(all ? series : series.filter((s) => s.bearing === bearing)).map((s) => <th key={s.bearing}>Gối #{s.bearing} ({unit})</th>)}<th>Thông tin</th></tr></thead>
                <tbody>
                  {rangeDays(from, to).flatMap((dt) => {
                    const rr = rs.filter((r) => r.date === dt);
                    return (rr.length ? rr : [null]).map((r, i) => (
                      <tr key={dt + i}>
                        <td>{dmyDate(dt)}</td><td>{r?.measureTime || "—"}</td>
                        {(all ? [1, 2, 3, 4, 5, 6] : [bearing]).map((b) => <td key={b}>{r ? fmt2(millPoints([r], b, metric, axis)[0]?.value) : "—"}</td>)}
                        <td>{r ? (millStopped(r) ? "Máy ngừng — bỏ khỏi trend" : all ? "Chỉ tính hướng đã đo" : (() => { const pt = millPoints([r], bearing, metric, axis)[0]; return pt ? `Có ${pt.count}/3 hướng đo` : "Chưa có số đo"; })()) : "Chưa có số đo"}</td>
                      </tr>
                    ));
                  })}
                </tbody>
              </MaTable>
            </MillDetails>
          </div>
          </section>

          <h2>Xu hướng · {device.name} · {dmyDate(from)} – {dmyDate(to)}</h2>
          <MillDetails summary="Xem thêm xu hướng đủ 6 gối / thông số khác">
            <MillBearingCharts device={device} rs={rs} ctx={ctx} />
            <MillFullTrendTable rs={rs} ctx={ctx} />
          </MillDetails>
          <MillMethodDetails rms={rms} />
          <ReferenceSection device={device} day={day} />
        </>
      )}
      </section></div>
    </>
  );
}

/** «Điểm đối chiếu từ bảng ca — tần số 1X theo RPM» (không phải đỉnh FFT). */
function ReferenceSection({ device, day }: { device: AnalysisDevice; day: string }) {
  const [b, setB] = React.useState(1);
  const [a, setA] = React.useState("max");
  const p = millReferencePoint(device, day, b, a);
  const GMF = ["—", "—", "463.40", "150.58", "57.92", "57.92"];
  const PA = ["—", "264.8", "264.8", "55.6", "55.6", "—"];
  const AX = ["Động cơ", "Động cơ", "Sơ cấp HGT", "Thứ cấp HGT", "BRC", "BRC"];
  return (
    <MillDetails summary="Điểm đối chiếu từ bảng ca — tần số 1X theo RPM">
      <p>Tần số tự tính f = RPM / 60 của đúng gối; vận tốc lấy nguyên giá trị đã lưu trong ngày chọn. Đây là điểm tham khảo, không phải đỉnh FFT.</p>
      <div className="ma-toolbar">
        <label>Gối<select value={b} onChange={(e) => setB(+e.target.value)}>{[1, 2, 3, 4, 5, 6].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Hướng đo<select value={a} onChange={(e) => setA(e.target.value)}>{["max", "X", "Y", "Z"].map((x) => <option key={x} value={x}>{x === "max" ? "Lớn nhất X/Y/Z" : x}</option>)}</select></label>
        <label>Tần số 1X (Hz)<input readOnly value={fmt2(p.frequency)} /></label>
        <label>Vận tốc bảng ca (mm/s)<input readOnly value={p.value === null ? "" : String(p.value)} /></label>
      </div>
      <p role="status">{p.value === null ? `Gối #${b} không có số vận tốc hợp lệ ngày ${dmyDate(day)} — không lấy ngày khác thay thế.` : `Ngày ca ${dmyDate(day)} · giờ ${p.time || "chưa ghi"} · gối #${b} · ${a === "max" ? "max các hướng đã đo" : a} · ${p.rpm} RPM → ${fmt2(p.frequency)} Hz · ${p.value} mm/s. Không phân vùng Wowk từ số tổng.`}</p>
      <MaTable>
        <thead><tr><th>Gối</th><th>Trục</th><th>RPM</th><th>1X Hz</th><th>GMF Hz</th><th>Viên nhựa PA Hz</th></tr></thead>
        <tbody>{[1, 2, 3, 4, 5, 6].map((g, i) => <tr key={g}><td>#{g}</td><td>{AX[i]}</td><td>{MILL_RPM[i]}</td><td>{fmt2(MILL_RPM[i] / 60)}</td><td>{GMF[i]}</td><td>{PA[i]}</td></tr>)}</tbody>
      </MaTable>
      <p >Tần số tham chiếu SCCN — Hình 6, trang PDF 6 (không phải đỉnh đã đo). GMF là tần số ăn khớp răng; đối chiếu thêm 2GMF/3GMF và dải biên. Wowk Hình 5 dùng vận tốc peak: số tổng RMS không được đổi bằng √2, điểm bảng ca không dùng để phân vùng Hình 5.</p>
    </MillDetails>
  );
}

void addDays; void ZoneTag;
