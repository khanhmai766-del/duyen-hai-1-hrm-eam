"use client";

import * as React from "react";
import { useSaveReport } from "@/hooks/useVibrationAnalysis";
import { externalAnalyze, externalBearingLayout, summarizeExternalIso } from "@/lib/vibration/analysis/external";
import { foundationKinds, foundationYKinds, machineTypes, pumpKinds, xAxisKinds } from "@/lib/vibration/analysis/machine";
import { ExternalIsoReport } from "./analysis-external-report";
import { IsoGuide } from "./analysis-external-guides";
import { Btn, Card, CellIn, FieldGrid, Hint, In, MeasureTable, PrintStyle, Sel, printReport, str, todayVn, toForm, type Form, type FormPatch } from "./analysis-external-fields";

const DEFAULTS: Form = { meterValue: "rms", condition: "stable" };
const EXTRA_KEYS = ["name", "x", "y", "dx", "dy", "temp"] as const;
const MAX_EXTRA = 12;
const LAYOUT_FIELDS = ["measureScope", "motorBearings", "machineBearings"];
const MEASURE_COLS: [string, string, string][] = [["vx", "Rung X", "mm/s"], ["vy", "Rung Y", "mm/s"], ["dx", "Dịch X", "µm p-p"], ["dy", "Dịch Y", "µm p-p"], ["t", "Nhiệt", "°C"]];
const EXTRA_COLS: [string, string, string][] = [["x", "Rung X", "mm/s"], ["y", "Rung Y", "mm/s"], ["dx", "Dịch X", "µm p-p"], ["dy", "Dịch Y", "µm p-p"], ["temp", "Nhiệt", "°C"]];

/** Tab "Thiết bị ngoài danh mục" — phương pháp ISO 20816-3 (external-analysis.js:externalView). Không ghi vào danh mục / lịch sử đo. */
export function AnalysisExternalIsoTab({ draft, setDraft }: { draft: Record<string, unknown>; setDraft: (v: Record<string, unknown>) => void }) {
  const form = React.useMemo(() => toForm(draft, DEFAULTS), [draft]);
  const [report, setReport] = React.useState<ReturnType<typeof externalAnalyze> | null>(null);
  const [msg, setMsg] = React.useState("");
  const reportRef = React.useRef<HTMLDivElement>(null);
  const save = useSaveReport();

  const bearings = externalBearingLayout(form);
  const extraCount = Math.min(MAX_EXTRA, Math.max(0, Number(form.extraCount) || 0));

  /** Mọi thay đổi: lưu bản nháp + làm báo cáo cũ mất hiệu lực (như sự kiện input của bản cũ). */
  const change: FormPatch = (p) => {
    const next: Form = { ...form, ...p };
    if (Object.keys(p).some((k) => LAYOUT_FIELDS.includes(k)) && !externalBearingLayout(next).some((b) => b.key === next.spectrumPoint)) next.spectrumPoint = "";
    if (report) { setReport(null); setMsg("Dữ liệu đã đổi; báo cáo trước không còn hiệu lực."); }
    setDraft(next);
  };
  const addPoint = () => { if (extraCount < MAX_EXTRA) change({ extraCount: String(extraCount + 1) }); };
  const removePoint = (index: number) => {
    const p: Form = {};
    for (let i = index; i < extraCount - 1; i++) for (const k of EXTRA_KEYS) p[`extra_${i}_${k}`] = str(form, `extra_${i + 1}_${k}`);
    for (const k of EXTRA_KEYS) p[`extra_${extraCount - 1}_${k}`] = "";
    p.extraCount = String(Math.max(0, extraCount - 1));
    change(p);
  };

  const analyze = () => {
    try {
      setReport(externalAnalyze(form));
      setMsg("Đã lập báo cáo sơ bộ. Kiểm tra các mục cần xác minh trước khi in.");
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const saveReport = async () => {
    if (!report) return;
    try {
      const r = await save.mutateAsync(summarizeExternalIso(report));
      setMsg(r.duplicate ? "Phiếu giống hệt đã có — đã cập nhật thời điểm lưu." : "Đã lưu phiếu vào dữ liệu. Xem lại ở mục “Phiếu đã lưu”.");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const reset = () => {
    if (!window.confirm("Tạo phiếu mới và bỏ bản nháp hiện tại?")) return;
    setReport(null);
    setMsg("");
    setDraft({ date: todayVn(), meterValue: "rms", condition: "stable" });
  };

  const common = { form, set: change };
  return (
    <div className="external-workspace">
      <PrintStyle />
      <div className="external-intro">
        <div>
          <span className="external-eyebrow">PHIẾU PHÂN TÍCH ĐỘC LẬP · QUY TRÌNH KỸ THUẬT CHUYÊN SÂU</span>
          <h2>Phân tích một thiết bị ngoài danh mục</h2>
          <p>Đánh giá mức rung, chất lượng phép đo và bằng chứng chẩn đoán trong một phiếu riêng. Không ghi vào danh mục hoặc lịch sử đo của nhà máy.</p>
        </div>
        <div className="external-intro-mark">01<span>thiết bị</span></div>
      </div>
      <IsoGuide />

      <form id="externalForm" className="external-form" noValidate onSubmit={(e) => e.preventDefault()}>
        <Card no="01" title="Nhận dạng & điều kiện vận hành" hint="Chọn đúng đối tượng trước khi áp tiêu chuẩn.">
          <FieldGrid>
            <In {...common} name="name" label="Tên thiết bị" />
            <In {...common} name="location" label="Hệ thống / vị trí" placeholder="Vị trí lắp đặt" />
            <In {...common} name="date" label="Ngày đo" type="date" />
            <In {...common} name="time" label="Giờ đo" type="time" />
            <In {...common} name="person" label="Người đo" placeholder="Họ tên" />
            <Sel {...common} name="type" label="Loại máy" options={[["", "— Chọn loại máy —"], ...machineTypes]} />
            <In {...common} name="powerKw" label="Công suất định mức thiết bị" unit="kW" type="number" />
            <In {...common} name="speedRpm" label="Tốc độ tại lúc đo" unit="vòng/phút" type="number" />
            <In {...common} name="unitPowerMw" label="Công suất tổ máy lúc đo" unit="MW" type="number" />
            <Sel {...common} name="foundation" label="Kiểu bệ phương X" options={foundationKinds} />
            <Sel {...common} name="foundationY" label="Kiểu bệ phương Y" options={foundationYKinds} />
            <Sel {...common} name="condition" label="Tình trạng máy" options={[["stable", "Chạy ổn định"], ["transient", "Chạy quá độ / chưa ổn định"], ["stopped", "Dừng / dự phòng"]]} />
            <Sel {...common} name="pumpKind" label="Loại bơm (nếu áp dụng)" options={[["", "— Chưa rõ —"], ...pumpKinds]} />
            <In {...common} name="shaftHeightMm" label="Chiều cao tâm trục H" unit="mm" type="number" />
            <In {...common} name="loadPercent" label="Tải tại lúc đo" unit="%" type="number" />
          </FieldGrid>
          <div className="external-layout-config">
            <h3>Cấu hình gối thực tế</h3>
            <FieldGrid>
              <Sel {...common} name="measureScope" label="Cụm cần phân tích" options={[["both", "Động cơ + bơm / quạt"], ["machine", "Chỉ bơm / quạt"], ["motor", "Chỉ động cơ"]]} />
              <Sel {...common} name="motorBearings" label="Số gối động cơ" options={[["2", "2 gối — NDE và DE"], ["1", "1 gối duy nhất"]]} />
              <Sel {...common} name="machineBearings" label="Số gối bơm / quạt" options={[["2", "2 gối — NDE và DE"], ["1", "1 gối duy nhất"]]} />
            </FieldGrid>
            <Hint>Một gối vẫn đo X/Y và dọc trục nếu tiếp cận được. Gối không tồn tại không nhập 0 và không tham gia đánh giá. Số gối không tự thay đổi tiêu chuẩn áp dụng.</Hint>
          </div>
        </Card>

        <Card no="02" title="Phép đo & truy xuất" hint="Ngưỡng ISO áp cho vận tốc RMS đo trên máy đang chạy ở điều kiện phù hợp.">
          <FieldGrid>
            <Sel {...common} name="meterValue" label="Giá trị máy đo" options={[["rms", "Vận tốc RMS (mm/s)"], ["peak", "Vận tốc PEAK — chưa thể so ISO"], ["unknown", "Chưa xác nhận RMS/PEAK"]]} />
            <Sel {...common} name="mounting" label="Gá cảm biến" options={[["", "— Chưa khai báo —"], ["stud", "Bắt vít / đế cố định"], ["magnet", "Nam châm"], ["hand", "Cầm tay"]]} />
            <In {...common} name="meter" label="Máy đo / mã thiết bị" placeholder="Hãng, model, mã máy" />
            <In {...common} name="calibrationDate" label="Ngày hiệu chuẩn gần nhất" type="date" />
            <In {...common} name="freqLowHz" label="Dải tần thấp" unit="Hz" type="number" />
            <In {...common} name="freqHighHz" label="Dải tần cao" unit="Hz" type="number" />
            <Sel {...common} name="xAxis" label="Quy ước phương X" options={xAxisKinds} />
            <In {...common} name="motorA" label="Dòng điện pha A" unit="A" type="number" />
            <In {...common} name="motorB" label="Dòng điện pha B" unit="A" type="number" />
            <In {...common} name="motorC" label="Dòng điện pha C" unit="A" type="number" />
          </FieldGrid>
          <Hint>Bắt vít / nam châm, hướng cảm biến, dải tần và lịch hiệu chuẩn ảnh hưởng độ tin cậy; số PEAK băng rộng không tự quy đổi sang RMS.</Hint>
        </Card>

        <Card no="03" title="Số đo tại từng gối" hint="Ô trống là chưa đo; 0 là số đo 0. Rung: mm/s theo chế độ máy đo ở mục 02; dịch chuyển: µm đỉnh-đỉnh.">
          <MeasureTable>
            <thead><tr><th>Vị trí đo</th>{MEASURE_COLS.map(([k, l, u]) => <th key={k}>{l}<br />{u}</th>)}</tr></thead>
            <tbody>
              {bearings.map((b) => (
                <tr key={b.key}>
                  <th>{b.name}</th>
                  {MEASURE_COLS.map(([k, l]) => <td key={k}><CellIn {...common} name={`${b.key}_${k}`} label={`${b.label} ${l}`} /></td>)}
                </tr>
              ))}
            </tbody>
          </MeasureTable>
        </Card>

        <Card no="03B" title="Điểm đo bổ sung theo cấu hình máy" hint="Dùng cho gối hộp số, ổ trung gian hoặc vị trí không có trong mẫu. Điểm này được ghi vào báo cáo nhưng không tự xếp vùng ISO khi chưa ánh xạ loại gối và tiêu chuẩn.">
          <MeasureTable extra>
            <thead><tr><th>Tên/vị trí điểm</th>{EXTRA_COLS.map(([k, l, u]) => <th key={k}>{l}<br />{u}</th>)}<th>Xóa</th></tr></thead>
            <tbody>
              {extraCount === 0 && <tr><td colSpan={7} className="external-extra-empty">Chưa có điểm đo bổ sung.</td></tr>}
              {Array.from({ length: extraCount }, (_, i) => (
                <tr key={i}>
                  <th><CellIn {...common} type="text" name={`extra_${i}_name`} label={`Tên điểm phụ ${i + 1}`} /></th>
                  {EXTRA_COLS.map(([k, l]) => <td key={k}><CellIn {...common} name={`extra_${i}_${k}`} label={`Điểm phụ ${i + 1} ${l}`} /></td>)}
                  <td><button type="button" className="external-remove" aria-label={`Xóa điểm phụ ${i + 1}`} onClick={() => removePoint(i)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </MeasureTable>
          <Btn onClick={addPoint} disabled={extraCount >= MAX_EXTRA}>+ Thêm điểm đo</Btn>
          <Hint>Tối đa 12 điểm phụ. Số liệu được giữ trong bản nháp trình duyệt, không thêm thiết bị vào danh mục.</Hint>
        </Card>

        <Card no="04" title="Bằng chứng chẩn đoán (không bắt buộc)" hint="Chỉ điền khi có phổ tại cùng điểm đo. Những dấu hiệu này giúp lập giả thuyết, không xác nhận hư hỏng.">
          <FieldGrid>
            <Sel {...common} name="spectrumPoint" label="Điểm đo phổ" options={[["", "— Chọn gối —"], ...bearings.map((b) => [b.key, b.name] as [string, string])]} />
            <In {...common} name="oneX" label="Thành phần 1X" unit="mm/s RMS" type="number" />
            <In {...common} name="twoX" label="Thành phần 2X" unit="mm/s RMS" type="number" />
            <In {...common} name="axial" label="Rung dọc trục cùng gối" unit="mm/s RMS" type="number" />
            <In {...common} name="phaseDeg" label="Chênh pha qua khớp" unit="độ" type="number" />
            <Sel {...common} name="harmonics" label="Phổ nhiều hài" options={[["", "Chưa có thông tin"], ["yes", "Có dấu hiệu nhiều hài"], ["no", "Không thấy"]]} />
            <Sel {...common} name="envelope" label="Phổ bao hình / ổ lăn" options={[["", "Chưa đo"], ["bearing", "Có vạch nghi tần số hư ổ"], ["none", "Đã đo, chưa thấy vạch"]]} />
            <Sel {...common} name="resonance" label="Run-up / coast-down" options={[["", "Chưa đo"], ["yes", "Có đỉnh rung theo tốc độ"], ["no", "Không thấy đỉnh"]]} />
            <label className="external-wide">Hiện tượng / lịch sử sửa chữa
              <textarea rows={3} value={str(form, "observations")} onChange={(e) => change({ observations: e.target.value })} />
            </label>
          </FieldGrid>
        </Card>

        <div className="external-actions">
          <div>
            <strong>Phiếu riêng, không thêm vào danh mục</strong>
            <span>Bản nháp tự giữ trong trình duyệt này; bấm “Lưu phiếu vào dữ liệu” để lưu kết quả vào mục “Phiếu đã lưu”. Báo cáo phải được người có chuyên môn rà soát trước khi dùng cho quyết định vận hành.</span>
          </div>
          <Btn primary onClick={analyze}>Phân tích thiết bị</Btn>
          <Btn onClick={saveReport} disabled={!report || save.isPending}>{save.isPending ? "Đang lưu…" : "Lưu phiếu vào dữ liệu"}</Btn>
          <Btn onClick={printReport} disabled={!report}>In / lưu báo cáo PDF</Btn>
          <Btn onClick={reset}>Phiếu mới</Btn>
        </div>
        <p id="externalMessage" role="status">{msg}</p>
      </form>

      <div ref={reportRef} id="externalReport" className="external-report">
        {report
          ? <ExternalIsoReport result={report} />
          : (
            <div className="external-empty">
              <span>{msg.startsWith("Dữ liệu đã đổi") ? "DỮ LIỆU ĐÃ THAY ĐỔI" : "CHƯA LẬP BÁO CÁO"}</span>
              <p>{msg.startsWith("Dữ liệu đã đổi") ? "Phân tích lại để cập nhật báo cáo theo số liệu vừa sửa." : "Nhập ít nhất tên thiết bị và một giá trị rung X/Y rồi chọn “Phân tích thiết bị”."}</p>
            </div>
          )}
      </div>
    </div>
  );
}
