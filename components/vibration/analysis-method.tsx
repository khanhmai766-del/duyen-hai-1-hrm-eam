"use client";

import * as React from "react";
import { toast } from "sonner";
import { VC } from "@/lib/vibration/analysis";
import { VC_META } from "@/lib/vibration/analysis/core";
import type { AnalysisSettings } from "@/lib/vibration/analysis/types";
import { useSaveAnalysisSettings } from "@/hooks/useVibrationAnalysis";
import { TableWrap, fmtN, type AnalysisTabProps } from "./analysis-shared";
import { MethodsCompare } from "./analysis-external-guides";

// vibration-analysis.js:PUBLIC_DOCS — chỉ dẫn link trang gốc (HD mục 1: "không dùng bản chia sẻ trái phép").
const PUBLIC_DOCS: [string, string, string][] = [
  ["R4", "NASA — RCM Guide 2008 (phụ lục E tiêu chí rung)", "https://www.nasa.gov/wp-content/uploads/2023/06/nasa-rcmguide.pdf"],
  ["R5", "Europump — Pump Vibration Standards Guidelines 2013", "https://www.europump.net/files/Publications/Guides/Guidelines%200n%20Pump%20Vibration%20First%20edition%20Final%20July%202013.pdf"],
  ["R6", "SKF — Vibration Diagnostic Guide CM5003", "https://skftechnicalsupport.zendesk.com/hc/en-us/articles/360033182914-Vibration-Diagnostic-Guide"],
  ["R15", "Power-MI — tần số bánh răng, động cơ", "https://www.power-mi.com/content/frequencies-gear-assembly"],
  ["R20", "Ludeca — Is This Alignment Good Enough? (2022)", "https://ludeca.com/blog/alignment/11111/is-this-alignment-good-enough/"],
  ["R1", "ISO 20816-3:2022 (mua bản gốc tại iso.org)", "https://www.iso.org/standard/78311.html"],
  ["R2", "ISO 10816-7:2009 (mua bản gốc tại iso.org)", "https://www.iso.org/standard/41726.html"],
  ["ISO 14694", "ISO 14694:2003 — quạt công nghiệp, cân bằng và rung (tra tại iso.org)", "https://www.iso.org/search.html?q=14694"],
  ["ISO 13373-2", "ISO 13373-2:2016 — xử lý, phân tích và trình bày dữ liệu rung (tra tại iso.org)", "https://www.iso.org/search.html?q=13373-2"],
  ["ISO 18436-2", "ISO 18436-2:2014 — năng lực nhân sự giám sát tình trạng rung (tra tại iso.org)", "https://www.iso.org/search.html?q=18436-2"],
  ["WOWK", "V. Wowk — A Brief Tutorial on Machine Vibration, Machine Dynamics Inc. (trang nhà xuất bản)", "https://www.machinedyn.com/"],
];
// vibration-analysis.js:DOC_USE — tài liệu nào dùng cho phần nào của web.
const DOC_USE: [string, React.ReactNode][] = [
  ["ISO 20816-3:2022 [R1]", <>Phương pháp <b>ISO 20816-3</b> ở tab Thiết bị trong danh mục và Thiết bị ngoài danh mục: nhóm máy, kiểu bệ, vùng A/B/C/D, Tiêu chí II, ALARM/TRIP, rung nền.</>],
  ["ISO 10816-7 [R2] · ISO 14694", "Bảng riêng cho bơm cánh động và quạt ≤ 300 kW trong cùng tab ISO (tự chọn theo “Loại máy”)."],
  ["ISO 13373-2 · ISO 18436-2", "Mục bằng chứng phổ/pha và giả thuyết nguyên nhân của phiếu ISO; yêu cầu người rà soát có năng lực."],
  ["Wowk [WOWK] + biểu đồ Machine Dynamics [CHART]", <>Phương pháp <b>Tài liệu Wowk</b> ở tab Thiết bị trong / ngoài danh mục, và đánh giá thay thế khi ISO thiếu thông tin: Bảng 1, Hình 5, lưu đồ Hình 1, Bảng 3, 6 tiêu chí phán đoán.</>],
  ["HD bản 4 (nội bộ)", "Quy trình tổng thể, chất lượng số liệu Q1–Q10, mức hành động; phiếu đã lưu (ISO & Wowk) chỉ lưu số liệu nhập và kết luận lúc lưu."],
];

const FLOW: [string, string][] = [
  ["DM · Chất lượng số liệu", "Q1–Q10: giải mã ô ngày/giờ, chữ số, máy dừng, lẫn µm/mm, đảo cột, thiếu dấu thập phân, chép lại, thiếu người/ngày, lệch dòng 3 pha, giá trị phi lý."],
  ["SD · Phát hiện trạng thái", "chọn tiêu chuẩn theo loại máy (HD mục 3), đánh giá từng gối lấy max X/Y; sát ranh giới ±10 %; bệ chưa rõ → cả cứng và mềm; mức nền = trung vị ≥ 3 lần hợp lệ ở tải tương đương; tiêu chí II; Wowk 2×/5×; tăng đột bậc; nhiệt tuyệt đối và tương đối."],
  ["HA · Giả thuyết", "7 luật tầng 1 (đặc tả 6.1), mức khớp tối đa \"Yếu\", mọi luật có mã nguồn HD mục 1.3."],
  ["AG · Khuyến cáo", "hành động theo mức (HD mục 8.1; quạt HD mục 9.1) và theo nguyên nhân (HD mục 8.2); danh sách cần đo thêm."],
];

type NumKey = "loadTolerance" | "baselineMin" | "baselineMax" | "changeRatio" | "stepRatio" | "tempRise";
const FIELDS: { key: NumKey; label: string; step: string; unit: string; scale: number }[] = [
  { key: "loadTolerance", label: "Tải tương đương: dòng lệch ≤", step: "1", unit: "%", scale: 100 },
  { key: "baselineMin", label: "Số lần đo tối thiểu cho mức nền", step: "1", unit: "lần", scale: 1 },
  { key: "baselineMax", label: "Số lần đo gần nhất lấy trung vị", step: "1", unit: "lần", scale: 1 },
  { key: "changeRatio", label: "Tiêu chí II: thay đổi >", step: "1", unit: "% cơ sở", scale: 100 },
  { key: "stepRatio", label: "Tăng đột bậc giữa 2 lần >", step: "1", unit: "% cơ sở", scale: 100 },
  { key: "tempRise", label: "Nhiệt tăng so mức nền ≥", step: "0.5", unit: "°C", scale: 1 },
];
const show = (s: AnalysisSettings, f: (typeof FIELDS)[number]) => String(+(s[f.key] * f.scale).toFixed(3));

/** Tham số cấu hình — tự lưu khi đổi (như web cũ: change → save), không có nút Lưu. */
function SettingsForm({ settings }: { settings: AnalysisSettings }) {
  const save = useSaveAnalysisSettings();
  const [vals, setVals] = React.useState<Record<NumKey, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, show(settings, f)])) as Record<NumKey, string>);
  const [requirePerson, setRequirePerson] = React.useState(settings.requirePerson);

  const commit = async (patchRaw: Partial<Record<NumKey, string>>, rp = requirePerson, el?: HTMLInputElement) => {
    const patch: Partial<AnalysisSettings> = { requirePerson: rp };
    for (const f of FIELDS) {
      const raw = (patchRaw[f.key] ?? vals[f.key]).trim();
      const n = Number(raw);
      if (raw === "" || !Number.isFinite(n) || n < 0) { el?.setCustomValidity("Nhập số không âm"); el?.reportValidity(); return; }
      patch[f.key] = ["baselineMin", "baselineMax"].includes(f.key) ? Math.max(1, Math.round(n / f.scale)) : n / f.scale;
    }
    el?.setCustomValidity("");
    try { await save.mutateAsync(patch); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <section className="an-sec">
      <h3>Tham số cấu hình (quy ước của đặc tả)</h3>
      <div className="an-settings">
        <label>Mức nền bắt buộc có người đo<span><input type="checkbox" data-an-setting="requirePerson" checked={requirePerson} onChange={(e) => { setRequirePerson(e.target.checked); commit({}, e.target.checked); }} /> Q8</span></label>
        {FIELDS.map((f) => (
          <label key={f.key}>{f.label}
            <span>
              <input type="number" step={f.step} min={0} data-an-setting={f.key} value={vals[f.key]}
                onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                onBlur={(e) => commit({ [f.key]: e.target.value }, requirePerson, e.target)}
                onKeyDown={(e) => { if (e.key === "Enter") commit({ [f.key]: e.currentTarget.value }, requirePerson, e.currentTarget); }} /> {f.unit}
            </span>
          </label>
        ))}
      </div>
      <p className="an-foot">Mặc định theo đặc tả mục 5.2–5.3. Đổi tham số chỉ ảnh hưởng phân tích, không sửa số liệu.</p>
    </section>
  );
}

const fnd = (g: string) => (g === "cung" ? "cứng" : "mềm");
const Card = ({ title, src, children }: { title: string; src?: string; children: React.ReactNode }) => (
  <div className="an-standard-card"><h4>{title}</h4><table className="an-table">{children}</table><small className="src">{src}</small></div>
);

function StandardsTables() {
  const T = VC.TC as Record<string, any>;
  return (
    <section className="an-sec an-standards">
      <h3>Bảng ngưỡng tiêu chuẩn (v{VC_META.schema}, {VC_META.ngay})</h3>
      <div className="an-standard-grid">
        <Card title="ISO 20816-3:2022 — vận tốc mm/s RMS" src={T.ISO_20816_3_2022?.nguon}>
          <thead><tr><th>Nhóm</th><th>Bệ</th><th>A/B</th><th>B/C</th><th>C/D</th></tr></thead>
          <tbody>{(T.ISO_20816_3_2022?.bang_van_toc || []).map((r: any, i: number) => <tr key={i}><td>{r.nhom}</td><td>{fnd(r.gia_do)}</td><td>{fmtN(r["A/B"])}</td><td>{fmtN(r["B/C"])}</td><td>{fmtN(r["C/D"])}</td></tr>)}</tbody>
        </Card>
        <Card title="ISO 14694 / AMCA 204 — quạt ≤ 300 kW" src={T.ISO_14694_2003_AMCA_204_20?.nguon}>
          <thead><tr><th>Hạng</th><th>Bệ</th><th>Khởi động</th><th>Cảnh báo</th><th>Dừng</th></tr></thead>
          <tbody>{(T.ISO_14694_2003_AMCA_204_20?.bang_tai_cho_rms || []).map((r: any, i: number) => <tr key={i}><td>{r.bv}</td><td>{fnd(r.gia_do)}</td><td>{fmtN(r.khoi_dong)}</td><td>{fmtN(r.canh_bao)}</td><td>{fmtN(r.dung)}</td></tr>)}</tbody>
        </Card>
        <Card title="ISO 10816-7:2009 — bơm cánh động" src={T.ISO_10816_7_2009?.nguon}>
          <thead><tr><th>Loại</th><th>Công suất</th><th>A/B</th><th>B/C</th><th>C/D</th></tr></thead>
          <tbody>{(T.ISO_10816_7_2009?.bang_van_toc || []).map((r: any, i: number) => <tr key={i}><td>{r.loai}</td><td>{r.cong_suat} kW</td><td>{fmtN(r["A/B"])}</td><td>{fmtN(r["B/C"])}</td><td>{fmtN(r["C/D"])}</td></tr>)}</tbody>
        </Card>
        <Card title="ISO 20816-2:2017 — tuabin/máy phát > 40 MW, thân ổ" src={T.ISO_20816_2_2017?.ghi_chu_nguon || ""}>
          <thead><tr><th>Tốc độ v/p</th><th>A/B</th><th>B/C</th><th>C/D</th></tr></thead>
          <tbody>{(T.ISO_20816_2_2017?.bang_than_o_van_toc || []).map((r: any, i: number) => <tr key={i}><td>{(r.toc_do_vpm || []).join(" / ")}</td><td>{fmtN(r["A/B"])}</td><td>{fmtN(r["B/C"])}</td><td>{fmtN(r["C/D"])}</td></tr>)}</tbody>
        </Card>
      </div>
      <p className="an-foot">Ngưỡng nằm trong <code>data/nguong_tieu_chuan_rung.json</code>, mỗi số có nguồn. Sửa ngưỡng: sửa JSON kèm nguồn rồi chạy <code>node build-standards.cjs</code>. ISO/FDIS 20816-1, 20816-3 (2026) chưa dùng số liệu.</p>
    </section>
  );
}

/** Tab "Phương pháp & tiêu chuẩn" (vibration-analysis.js:methodView + docsSection, analysis-hub.js:methodsCompareHtml). */
export function AnalysisMethodTab({ settings }: AnalysisTabProps) {
  return (
    <>
      <section className="an-sec">
        <h3>Tài liệu cơ sở</h3>
        <ul className="an-links">
          {PUBLIC_DOCS.map(([c, t, u]) => (
            <li key={c}><span className="src">[{c}]</span> <a href={u} target="_blank" rel="noopener noreferrer">{t} ↗</a></li>
          ))}
        </ul>
        <h4>Tài liệu được dùng ở đâu</h4>
        <TableWrap>
          <thead><tr><th>Tài liệu</th><th>Phần của web</th></tr></thead>
          <tbody>{DOC_USE.map(([d, u]) => <tr key={d}><th>{d}</th><td>{u}</td></tr>)}</tbody>
        </TableWrap>
        <MethodsCompare />
        <p className="an-foot">Bản toàn văn tiêu chuẩn ISO và sách của Wowk không đặt trên web này vì có bản quyền — tra bản gốc theo liên kết ở trên (HD mục 1).</p>
      </section>
      <section className="an-sec">
        <h3>Quy trình (ISO 13374-1)</h3>
        <ol className="an-flow">{FLOW.map(([h, t]) => <li key={h}><b>{h}</b> — {t}</li>)}</ol>
      </section>
      <SettingsForm key={JSON.stringify(settings)} settings={settings} />
      <StandardsTables />
    </>
  );
}
