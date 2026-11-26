"use client";

import * as React from "react";
import { toast } from "sonner";
import { rgName } from "@/lib/vibration/analysis";
import { useSaveBaseline } from "@/hooks/useVibrationAnalysis";
import { Foot, Sec, TableWrap, fmtN, vnDate } from "./analysis-shared";

const WOWK_TXT: Record<string, string> = { duoi_2x: "< 2×", dang_ke_2x: "≥ 2× đáng kể", nghiem_trong_5x: "≥ 5× nghiêm trọng", khong_tinh_duoc: "—" };
const Small = ({ children, className }: { children: React.ReactNode; className?: string }) => <small className={className}>{children}</small>;

/** Ô "Đặt lại mức nền từ ngày" — tự lưu khi đổi ngày như web cũ (change → save) qua PUT /api/vibration/analysis/baseline. */
function BaselineForm({ deviceId, value }: { deviceId: string; value: string }) {
  const save = useSaveBaseline();
  const [v, setV] = React.useState(value);
  const onChange = async (next: string) => {
    setV(next);
    try {
      await save.mutateAsync({ deviceId, baselineFrom: next });
      toast.success("Đã lưu mốc mức nền");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="an-baseline">
      <label>Đặt lại mức nền từ ngày (sau sửa chữa / đại tu)<input type="date" id="anBaselineFrom" value={v} onChange={(e) => onChange(e.target.value)} /></label>
      <span>Các lần đo trước ngày này không dùng làm mức nền; lần đo đầu tiên từ ngày này được kiểm nghiệm thu ≤ 1,25 × A/B [R1 §6.2.3, §6.5.2].</span>
    </div>
  );
}

function EvalCell({ x }: { x: any }) {
  return (
    <>
      {x.evals.map((e: any, i: number) => e.error ? (
        <div key={i} className="ev"><small>{e.ev.label}: {e.error}</small></div>
      ) : (
        <div key={i} className="ev" data-role={e.ev.role}>
          <span className="lv-dot" data-level={e.level} />
          <b>{e.text}</b>{" "}
          <small>
            {e.ev.role} · {e.ev.label}{e.g ? " · bệ " + (e.g === "cung" ? "cứng" : "mềm") : ""} · {Object.entries(e.rg).map(([k, v]) => rgName(k) + " " + fmtN(v as number)).join(" / ")}
            {e.near?.length > 0 && <> · <b>sát ranh giới {e.near.map(rgName).join(", ")}</b> (±10 %)</>}
            {e.ev.note ? " · " + e.ev.note : ""}
            {(e.per || []).filter((p: any) => p.dispNote).map((p: any, j: number) => <React.Fragment key={j}><br />{p.dir}: {p.dispNote}</React.Fragment>)}
          </small>
        </div>
      ))}
    </>
  );
}

function AlarmCell({ x }: { x: any }) {
  const main = x.evals.find((e: any) => e.ev.role === "chính" && e.trip);
  const fan = x.evals.find((e: any) => e.ev.role === "chính" && e.kind === "fan");
  return (
    <>
      {Object.entries(x.dirs || {}).map(([dir, o]: [string, any]) => <div key={dir}><b>{dir}</b> {o.alarm != null ? fmtN(o.alarm, 2) : "—"}</div>)}
      {fan && <Small>quạt ISO 14694: mức cảnh báo {fmtN(fan.alarm, 2)}</Small>}
      <div>TRIP {main ? fmtN(main.trip, 2) : "—"}</div>
      <Small>chỉ để kỹ sư duyệt</Small>
      {x.accept && <Small className={x.accept.dat ? "acc-ok" : "acc-bad"}>Nghiệm thu sau sửa {x.accept.rule} ({fmtN(x.accept.gioi_han, 2)}): <b>{x.accept.dat ? "đạt" : "không đạt"}</b> — so thêm với rung trước khi sửa [R1 §6.2.3]</Small>}
      {x.bg && <Small className={x.bg.dang_ke ? "acc-bad" : undefined}>Rung nền khi dừng ({vnDate(x.bg.date)}): {fmtN(x.bg.vStop, 2)} {x.bg.dang_ke ? <b>&gt;</b> : "≤"} {fmtN(x.bg.nguong, 2)} = min(25 % rung chạy; 25 % B/C) [R1 §4.6]</Small>}
    </>
  );
}

/** Mục 3 — Mức độ theo tiêu chuẩn (Criterion I) và so mức nền (Criterion II). */
export function BearingSection({ res, deviceId, baselineFrom }: { res: any; deviceId: string; baselineFrom: string }) {
  const f1x = res.plan.f1x;
  const tempRise = res.settings.tempRise;
  return (
    <Sec title="3. Mức độ theo tiêu chuẩn (Criterion I) và so mức nền (Criterion II)">
      <TableWrap>
        <thead><tr><th>Gối</th><th>X / Y (mm/s)</th><th>Max</th><th>Đánh giá</th><th>Mức nền</th><th>Thay đổi</th><th>ALARM / TRIP khuyến nghị</th><th>Nhiệt °C</th><th>f_tđ (Hz)</th></tr></thead>
        <tbody>
          {res.bearings.map((x: any) => (
            <tr key={x.b.key}>
              <th>{x.b.label}<Small>{x.b.name}</Small></th>
              <td>{fmtN(x.vx)} / {fmtN(x.vy)}{x.ratio != null && <Small>tỉ lệ {fmtN(x.ratio, 2)}</Small>}</td>
              <td><b>{fmtN(x.v)}</b></td>
              <td><EvalCell x={x} /></td>
              <td>
                {Object.entries(x.dirs || {}).map(([dir, o]: [string, any]) => o.base != null
                  ? <div key={dir}><b>{dir}</b> {fmtN(o.base, 2)}<Small>trung vị {o.baseN} lần {vnDate(o.baseFrom)} → {vnDate(o.baseTo)}{o.baseAmp ? "" : " · không có dòng điện để so tải"}</Small></div>
                  : <div key={dir}><b>{dir}</b> <small>{o.baseMissing || "—"}</small></div>)}
                {!Object.keys(x.dirs || {}).length && "—"}
              </td>
              <td>
                {Object.entries(x.dirs || {}).map(([dir, o]: [string, any]) => (
                  <div key={dir}><b>{dir}</b> {o.crit ? <>{o.crit.delta >= 0 ? "+" : ""}{fmtN(o.crit.delta, 2)} {o.crit.dang_ke && <b>đáng kể</b>}<Small>ngưỡng ± {fmtN(o.crit.nguong, 2)} · Wowk {WOWK_TXT[o.wowk] ?? "—"}</Small></> : "—"}
                    {o.step && <Small><b>tăng đột bậc</b> so lần trước {fmtN(o.prevV)}</Small>}</div>
                ))}
                {!Object.keys(x.dirs || {}).length && "—"}
              </td>
              <td><AlarmCell x={x} /></td>
              <td>{fmtN(x.t, 0)}{x.tBase != null && <Small>nền {fmtN(x.tBase, 0)}{x.tRise && <> · <b>tăng ≥ {tempRise} °C</b></>}</Small>}</td>
              <td>{[x.fx, x.fy].map((f: number | null) => (f == null ? "—" : fmtN(f, 1) + (f1x ? ` (${fmtN(f / f1x, 1)}X)` : ""))).join(" / ")}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <Foot>Mỗi phương đánh giá theo kiểu bệ của phương đó [R1 §5.3]; mức của gối là phương khắt khe hơn [R1 §6.2.1]. Giá trị trong ±10 % quanh ranh giới báo &quot;sát ranh giới&quot; [R21 mục 8.1.1]. Tiêu chí II so cùng vị trí, cùng phương: |hiện tại − nền| &gt; 25 % × B/C (quạt theo ISO 14694: mức cảnh báo — quy ước HD mục 9.1) [R1 §6.3]. ALARM theo từng phương = min(nền + 0,25·B/C; 1,25·B/C) [R1 §6.5.2]; TRIP ≤ 1,25·C/D [R1 §6.5.3] — <b>không tự áp làm ngưỡng chính thức</b>. f_tđ = √2·v/(π·D) chỉ đúng khi một tần số trội [DOC mục 6]. Dịch chuyển chỉ bắt buộc khi &lt; 600 v/p hoặc tần số thấp [R1 Phụ lục A].</Foot>
      <BaselineForm key={deviceId + baselineFrom} deviceId={deviceId} value={baselineFrom} />
    </Sec>
  );
}
