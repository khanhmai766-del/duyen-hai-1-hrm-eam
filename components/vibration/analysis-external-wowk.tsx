"use client";

import * as React from "react";
import { useSaveReport } from "@/hooks/useVibrationAnalysis";
import { EW_ORDERS, ewAnalyze, ewBearingCount, ewFrequencyHelp, ewPointDefinitions, summarizeExternalWowk } from "@/lib/vibration/analysis/external";
import { wowkTable } from "@/lib/vibration/analysis/wowk";
import { WowkReport } from "./analysis-wowk-report";
import { WowkGuide } from "./analysis-external-guides";
import { Btn, Card, Fld, FieldGrid, In, MeasureTable, PrintStyle, Sel, printReport, str, todayVn, toForm, type Form, type FormPatch } from "./analysis-external-fields";

const EVIDENCE: [string, string][] = [["", "Chưa có bằng chứng đặc trưng"], ["radial", "1X trội ở phương hướng kính"], ["axial", "1X / 2X trội ở dọc trục"], ["harmonics", "Nhiều hài / phân hài trên phổ"], ["bearing", "Phổ bao hình có tần số lỗi ổ đã xác minh"], ["resonance", "Run-up / coast-down có đỉnh cộng hưởng"]];

/** Tab "Thiết bị ngoài danh mục" — phương pháp Wowk (external-wowk.js:ewView). Chỉ giữ bản nháp trong trình duyệt. */
export function AnalysisExternalWowkTab({ draft, setDraft }: { draft: Record<string, unknown>; setDraft: (v: Record<string, unknown>) => void }) {
  const form = React.useMemo(() => toForm(draft, {}), [draft]);
  const [report, setReport] = React.useState<ReturnType<typeof ewAnalyze> | null>(null);
  const [msg, setMsg] = React.useState("");
  const save = useSaveReport();
  const mode = form.freqMode === "fft" ? "fft" : "order";
  const orderSel = str(form, "order") || "1";

  const change: FormPatch = (p) => {
    if (report) { setReport(null); setMsg("Dữ liệu đã thay đổi. Phân tích lại trước khi xuất báo cáo."); }
    const next: Form = { ...form, ...p };
    if (p.freqMode === "fft" && form.freqMode !== "fft") next.freq = ""; // ewSyncFrequency: chuyển sang đỉnh FFT thì bỏ tần số ước tính
    setDraft(next);
  };
  const rpm = Number(str(form, "rpm"));
  const factor = orderSel === "custom" ? Number(str(form, "customOrder")) : Number(orderSel);
  const shownFreq = mode === "order" ? (rpm > 0 && factor > 0 ? ((rpm / 60) * factor).toFixed(3) : "") : str(form, "freq");
  const common = { form, set: change };
  const rows = wowkTable();
  const count = ewBearingCount(form);

  const analyze = () => {
    try {
      const f: Form = { ...form };
      if (mode === "order") f.freq = shownFreq;
      setReport(ewAnalyze(f));
      setMsg("");
    } catch (e) { setMsg((e as Error).message); }
  };
  const saveReport = async () => {
    if (!report) return;
    try {
      const r = await save.mutateAsync(summarizeExternalWowk(report));
      setMsg(r.duplicate ? "Phiếu giống hệt đã có — đã cập nhật thời điểm lưu." : "Đã lưu phiếu vào dữ liệu. Xem lại ở mục “Phiếu đã lưu”.");
    } catch (e) { setMsg((e as Error).message); }
  };
  const reset = () => {
    if (!window.confirm("Tạo phiếu mới và bỏ bản nháp hiện tại?")) return;
    setReport(null); setMsg(""); setDraft({ date: todayVn() });
  };

  return (
    <div className="external-workspace ew-workspace">
      <PrintStyle />
      <div className="external-intro">
        <div>
          <span className="external-eyebrow">PHIẾU ĐỘC LẬP · VICTOR WOWK</span>
          <h2>Thiết bị ngoài danh mục theo Wowk</h2>
          <p>Khảo sát → đối chiếu mức rung → giả thuyết → kiểm chứng → hướng khắc phục. Không thay thế tiêu chuẩn ISO hoặc giới hạn của nhà chế tạo.</p>
        </div>
      </div>
      <WowkGuide />
      <form id="ewForm" className="external-form" noValidate onSubmit={(e) => e.preventDefault()}>
        <Card no="01" title="Thiết bị & điều kiện đo" hint="Chọn đúng dòng Bảng 1; không tự áp dòng gần nhất khi máy ngoài phạm vi.">
          <FieldGrid>
            <In {...common} name="name" label="Tên thiết bị" />
            <In {...common} name="location" label="Vị trí / hệ thống" />
            <In {...common} name="date" label="Ngày đo" type="date" />
            <In {...common} name="person" label="Người đo" />
            <In {...common} name="rpm" label="Tốc độ thực tế" unit="vòng/phút" type="number" />
            <In {...common} name="load" label="Tải / chế độ vận hành" />
            <Sel {...common} name="row" label="Phân loại theo Bảng 1" options={[["", "Chưa xác định / ngoài Bảng 1"], ...rows.map((r: { ma: string; ten: string }) => [r.ma, r.ten] as [string, string])]} />
            <In {...common} name="meter" label="Thiết bị đo / tình trạng hiệu chuẩn" />
            <In {...common} name="mount" label="Cách gá cảm biến / vị trí đo" />
            <Sel {...common} name="bearingCount" label="Số gối của thiết bị đang phân tích" options={[["1", "1 gối duy nhất"], ["2", "2 gối — NDE và DE"]]} />
          </FieldGrid>
        </Card>

        <Card no="02" title="Khảo sát tại gối đỡ" hint="Nhập giá trị peak đo được. Dịch chuyển phải là thành phần 1X peak-to-peak. Không quy đổi số tổng RMS đa tần bằng √2.">
          <div className="ew-table-scroll"><table className="external-measure-table">
            <thead><tr><th>Gối / phương</th><th>Vận tốc tổng<br />mm/s peak</th><th>Dịch chuyển 1X<br />µm p-p</th><th>Gia tốc tổng<br />g peak</th><th>Nhiệt<br />°C</th><th>Vận tốc nền<br />mm/s peak</th></tr></thead>
            <tbody>
              {ewPointDefinitions({ ...form, bearingCount: String(count) }).map(({ name, i }) => (
                <tr key={i}>
                  <th>{name}</th>
                  {["v", "d", "a", "t", "base"].map((k) => (
                    <td key={k}><input aria-label={`${name} ${k}`} type="number" min={0} step="any" inputMode="decimal" value={str(form, `p${i}_${k}`)} onChange={(e) => change({ [`p${i}_${k}`]: e.target.value })} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table></div>
          <In {...common} name="point" label="Tên gối / vị trí khảo sát" />
          <p className="ew-note">Ô trống = chưa đo, không coi là 0. Giá trị nền chỉ so khi cùng máy, điểm, phương, tốc độ, tải và dải đo.</p>
          <label><input type="checkbox" checked={form.comparable === true} onChange={(e) => change({ comparable: e.target.checked })} /> Xác nhận số nền có cùng điều kiện đo</label>
        </Card>

        <Card no="03" title="Phổ đo & bằng chứng nguyên nhân" hint="Chọn ước tính theo RPM để tham khảo bậc quay, hoặc nhập đúng đỉnh tần số–biên độ trên phổ FFT. Chỉ dữ liệu FFT mới xác nhận được thành phần phổ thực.">
          <FieldGrid>
            <Sel {...common} name="freqMode" label="Nguồn tần số" options={[["order", "Ước tính từ tốc độ quay (mặc định 1×)"], ["fft", "Nhập đỉnh phổ FFT từ máy đo"]]} />
            <Sel {...common} name="order" label="Bậc tần số" disabled={mode === "fft"} options={EW_ORDERS} />
            {orderSel === "custom" && mode === "order" && <In {...common} className="ew-custom-order" name="customOrder" label="Bậc quay tùy chỉnh (×)" type="number" />}
            <Fld label="Tần số thành phần phổ" unit="Hz">
              <input name="freq" type="number" min={0} step="any" readOnly={mode === "order"} aria-describedby="ewFrequencyHelp" value={shownFreq} onChange={(e) => change({ freq: e.target.value })} />
            </Fld>
            <In {...common} name="peak" label="Vận tốc peak tại đỉnh đang xét" unit="mm/s peak" type="number" />
            <In {...common} name="spectrum" label="Phương đo / tên phổ / mã tệp bằng chứng" />
            <Sel {...common} name="evidence" label="Đặc điểm đã quan sát" options={EVIDENCE} />
            <In {...common} name="phase" label="Pha / phép thử / mã bằng chứng" />
            <In {...common} name="history" label="Diễn biến rung, nhiệt và bảo dưỡng" />
          </FieldGrid>
          <p id="ewFrequencyHelp" className="ew-frequency-help" aria-live="polite">{ewFrequencyHelp({ ...form, rpm: str(form, "rpm"), order: orderSel })}</p>
          <label>Ghi chú kiểm tra thực tế
            <textarea rows={3} value={str(form, "notes")} onChange={(e) => change({ notes: e.target.value })} />
          </label>
        </Card>

        <div className="ew-actions">
          <Btn primary onClick={analyze}>Phân tích theo Wowk</Btn>
          <Btn onClick={saveReport} disabled={!report || save.isPending}>{save.isPending ? "Đang lưu…" : "Lưu phiếu vào dữ liệu"}</Btn>
          <Btn onClick={printReport} disabled={!report}>Xuất báo cáo PDF / In</Btn>
          <Btn onClick={reset}>Phiếu mới</Btn>
        </div>
        <p id="ewError" role="alert">{msg}</p>
        <p className="ew-note">Bản nháp giữ tại trình duyệt này; “Lưu phiếu vào dữ liệu” lưu kết quả vào mục “Phiếu đã lưu” để xem lại. Chọn “Lưu dưới dạng PDF” trong hộp thoại in để tải báo cáo.</p>
      </form>
      <div id="ewResult" aria-live="polite">
        {report ? <WowkReport result={report} /> : <div className="external-card ew-empty">Nhập dữ liệu và chọn “Phân tích theo Wowk” để tạo báo cáo có căn cứ.</div>}
      </div>
    </div>
  );
}
