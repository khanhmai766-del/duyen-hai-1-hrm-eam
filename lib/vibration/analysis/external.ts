/* eslint-disable @typescript-eslint/no-explicit-any */
// Phiếu phân tích thiết bị NGOÀI danh mục (ISO 20816-3 và Wowk). Port từ vibracontrol/external-analysis.js
// (externalNumber, externalBearingLayout, externalAnalyze, externalHypotheses), external-wowk.js (ew*) và analysis-hub.js (tóm tắt phiếu lưu).
// Chỉ tính toán — không ghi vào danh mục / lịch sử đo. Giao diện ở components/vibration/analysis-external-*.tsx.
import { TC, vungBieuDoMd } from "./core";
import { analyzeRecord, BEARINGS, qualityCheck, standardPlan } from "./engine";
import { LEVELS, STD_SHORT, type Level } from "./texts";
import { fmtN } from "./util";
import { wowkTable } from "./wowk";
import type { AnalysisDevice, AnalysisRecord, BearingDef } from "./types";

// external-analysis.js:externalNumber — chỉ nhận dấu chấm thập phân (AGENTS Q6/Q9).
export function externalNumber(v: unknown, label: string): number | null {
  if (String(v ?? "").trim() === "") return null;
  const s = String(v).trim();
  if (s.includes(",")) throw Error(`${label}: dùng dấu chấm thập phân (ví dụ 14.6), không dùng dấu phẩy.`);
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) || !Number.isFinite(+s)) throw Error(`${label}: nhập số không âm hoặc để trống.`);
  return +s;
}

export type ExternalForm = Record<string, any>;
// external-analysis.js:externalBearingLayout
export function externalBearingLayout(data: ExternalForm): BearingDef[] {
  const scope = ["both", "machine", "motor"].includes(data.measureScope) ? data.measureScope : "both";
  return BEARINGS.filter((b) => {
    if ((scope === "machine" && b.part === "motor") || (scope === "motor" && b.part === "machine")) return false;
    const count = String(data[b.part === "motor" ? "motorBearings" : "machineBearings"] || "2");
    if (count === "1") return b.key === (b.part === "motor" ? "DC_KT" : "QB_KT");
    return true;
  }).map((b) => {
    const one = String(data[b.part === "motor" ? "motorBearings" : "machineBearings"]) === "1";
    return { ...b, name: one ? (b.part === "motor" ? "Động cơ · Gối duy nhất" : "Bơm / quạt · Gối duy nhất") : b.name, label: one ? (b.part === "motor" ? "ĐC · Gối duy nhất" : "Bơm/quạt · Gối duy nhất") : b.label };
  });
}

// external-analysis.js:externalAnalyze
export function externalAnalyze(data: ExternalForm, now = new Date()): any {
  if (!String(data.name || "").trim()) throw Error("Nhập tên thiết bị.");
  if (!data.date) throw Error("Chọn ngày đo.");
  const bearings = externalBearingLayout(data);
  const values: (number | null)[] = Array(23).fill(null);
  if (data.measureScope !== "machine") for (let i = 0; i < 3; i++) values[i] = externalNumber(data[["motorA", "motorB", "motorC"][i]], "Dòng điện pha " + "ABC"[i]);
  for (const b of bearings) for (const k of ["vx", "dx", "vy", "dy", "t"] as const) values[b[k]] = externalNumber(data[b.key + "_" + k], b.label + " " + k);
  const extraCount = Number(data.extraCount) || 0;
  if (!Number.isInteger(extraCount) || extraCount < 0 || extraCount > 12) throw Error("Số điểm đo bổ sung không hợp lệ.");
  const extraPoints = Array.from({ length: extraCount }, (_, i) => {
    const prefix = `extra_${i}_`;
    const name = String(data[prefix + "name"] || "").trim();
    const x = externalNumber(data[prefix + "x"], `Điểm phụ ${i + 1} rung X`);
    const y = externalNumber(data[prefix + "y"], `Điểm phụ ${i + 1} rung Y`);
    const dx = externalNumber(data[prefix + "dx"], `Điểm phụ ${i + 1} dịch X`);
    const dy = externalNumber(data[prefix + "dy"], `Điểm phụ ${i + 1} dịch Y`);
    const temp = externalNumber(data[prefix + "temp"], `Điểm phụ ${i + 1} nhiệt`);
    if ((x != null || y != null || dx != null || dy != null || temp != null) && !name) throw Error(`Nhập tên/vị trí điểm phụ ${i + 1}.`);
    return { bearing: { key: `external_${i}`, name: name || `Điểm phụ ${i + 1}`, label: name || `Điểm phụ ${i + 1}` } as any, radial: [x, y].filter((v) => v != null) as number[], x, y, dx, dy, temp, extra: true };
  }).filter((p) => p.radial.length || p.dx != null || p.dy != null || p.temp != null);
  const hasMainVelocity = BEARINGS.some((b) => values[b.vx] != null || values[b.vy] != null);
  if (!hasMainVelocity && !extraPoints.some((p) => p.radial.length)) throw Error("Cần ít nhất một số đo vận tốc rung X hoặc Y.");
  const nums: Record<string, number | null> = {};
  for (const [k, l] of [["powerKw", "Công suất định mức"], ["speedRpm", "Tốc độ"], ["unitPowerMw", "Công suất tổ máy"], ["loadPercent", "Tải"], ["shaftHeightMm", "Chiều cao tâm trục"], ["freqLowHz", "Dải tần thấp"], ["freqHighHz", "Dải tần cao"], ["oneX", "1X"], ["twoX", "2X"], ["axial", "Dọc trục"], ["phaseDeg", "Chênh pha"]]) nums[k] = externalNumber(data[k], l);
  if (nums.speedRpm != null && nums.speedRpm > 30000) throw Error("Tốc độ > 30.000 v/p: kiểm tra lại giá trị nhập.");
  if (nums.loadPercent != null && nums.loadPercent > 200) throw Error("Tải > 200%: kiểm tra lại giá trị nhập.");
  if (nums.phaseDeg != null && nums.phaseDeg > 360) throw Error("Chênh pha phải trong 0–360°.");
  if (nums.freqLowHz != null && nums.freqHighHz != null && nums.freqLowHz >= nums.freqHighHz) throw Error("Dải tần thấp phải nhỏ hơn dải tần cao.");
  const machine = { type: data.type || "", powerKw: nums.powerKw, speedRpm: nums.speedRpm, foundation: data.foundation || "chua_xac_dinh", foundationY: data.foundationY || "", pumpKind: data.pumpKind || "", shaftHeightMm: nums.shaftHeightMm, meterValue: data.meterValue || "unknown", freqLowHz: nums.freqLowHz, xAxis: data.xAxis || "chua_ro" };
  const record: AnalysisRecord = { date: data.date, measureTime: data.time || "", person: String(data.person || "").trim(), values, extra: {}, kind: "EXTERNAL" };
  const device: AnalysisDevice = { id: "external-one-off", area: "Thiết bị ngoài danh mục", system: data.location || "", name: String(data.name).trim(), machine, alertConfig: { vibration: 999, vibrationDanger: 1000, temperature: 999, temperatureDanger: 1000 }, records: [record] };
  const plan = standardPlan(device);
  const quality = qualityCheck(device, record, null, plan.f1x);
  const measured = BEARINGS.filter((b) => values[b.vx] != null || values[b.vy] != null);
  const mapped = measured.every((b) => plan.forPart(b.part).some((ev: any) => ev.role === "chính" && ev.id !== "IEC_60034_14_2018"));
  const scopeOk = !!plan.main && data.type !== "khac" && mapped;
  const measurementOk = data.meterValue === "rms" && data.condition === "stable" && !quality.stopped;
  const res = hasMainVelocity && scopeOk && measurementOk ? analyzeRecord(device, record, { plan, history: [record] }) : null;
  const issues: string[] = [];
  if (!scopeOk) issues.push("Chưa chọn được tiêu chuẩn phù hợp; không áp ngưỡng chung 4,5/7,1 mm/s cho thiết bị ngoài danh mục.");
  if (!hasMainVelocity) issues.push("Chỉ có điểm đo phụ; chưa có gối chuẩn để phần mềm đánh giá vùng ISO.");
  if (data.meterValue !== "rms") issues.push("Chưa xác nhận vận tốc RMS; số PEAK băng rộng không tự quy đổi để so bảng ISO.");
  if (data.condition !== "stable") issues.push("Máy không chạy ổn định; không áp tiêu chí rung ở trạng thái chạy ổn định.");
  if (quality.stopped && hasMainVelocity) issues.push("Các số đo cho thấy máy dừng hoặc dòng điện đều bằng 0; cần xác nhận trạng thái máy.");
  if (!data.person) issues.push("Thiếu người đo.");
  if (!data.meter) issues.push("Thiếu mã máy đo.");
  if (!data.calibrationDate) issues.push("Chưa ghi ngày hiệu chuẩn.");
  if (data.mounting === "hand") issues.push("Đầu đo cầm tay làm giảm tính lặp lại; ưu tiên bắt vít / nam châm trên điểm đo cố định.");
  if (!data.mounting) issues.push("Chưa ghi cách gá cảm biến.");
  if (!data.xAxis || data.xAxis === "chua_ro") issues.push("Chưa xác định phương X ngang hay đứng.");
  if (nums.freqLowHz == null || nums.freqHighHz == null) issues.push("Chưa ghi đủ dải tần máy đo.");
  else if (nums.freqHighHz < 1000 || nums.freqLowHz > (nums.speedRpm != null && nums.speedRpm < 600 ? 2 : 10)) issues.push("Dải tần đo có thể không bao phủ dải cần đánh giá; kiểm tra theo tiêu chuẩn, tốc độ và cảm biến.");
  if (!nums.speedRpm) issues.push("Thiếu tốc độ tại lúc đo, không xác định được tần số 1X.");
  if (!nums.powerKw) issues.push("Thiếu công suất định mức thiết bị để phân nhóm tiêu chuẩn.");
  if (!data.foundation || data.foundation === "chua_xac_dinh") issues.push("Chưa xác nhận kiểu bệ cứng/mềm.");
  issues.push(...quality.flags.filter((f: any) => f.level === "loi").map((f: any) => f.msg));
  if (extraPoints.some((p) => p.radial.length)) issues.push("Có điểm đo phụ: chưa ánh xạ tiêu chuẩn/vị trí gối nên không cộng vào mức ISO tự động; kỹ sư cần đánh giá riêng.");
  const points: any[] = [...bearings.map((b) => ({ bearing: b, radial: [values[b.vx], values[b.vy]].filter((v) => v != null), x: values[b.vx], y: values[b.vy], dx: values[b.dx], dy: values[b.dy], temp: values[b.t] })).filter((p) => p.radial.length || p.dx != null || p.dy != null || p.temp != null), ...extraPoints];
  for (const b of bearings) if (values[b.vx] == null && values[b.vy] == null) issues.push(`Chưa đo rung X/Y tại ${b.name} (gối có trong cấu hình).`);
  const hasSpectralEvidence = nums.oneX != null || nums.twoX != null || nums.axial != null || data.harmonics === "yes" || data.envelope === "bearing" || data.resonance === "yes";
  const linkedSpectrum = !!data.spectrumPoint && points.some((p) => p.bearing.key === data.spectrumPoint && p.radial.length);
  if (hasSpectralEvidence && !linkedSpectrum) issues.push("Bằng chứng phổ/pha chưa gắn với một gối có số đo rung cùng vị trí; không lập giả thuyết tự động.");
  const diagnoses = data.meterValue === "rms" && data.condition === "stable" && linkedSpectrum ? externalHypotheses(data, nums, points, res) : [];
  const confidence = !res ? "Chưa đủ điều kiện đánh giá theo chuẩn" : issues.length || !data.spectrumPoint || nums.oneX == null ? "Sơ bộ — cần bổ sung bằng chứng" : "Sơ bộ có đối chiếu phổ — cần kỹ sư xác nhận";
  return { data, nums, device, record, plan, quality, res, issues, points, bearings, diagnoses, confidence, generatedAt: now.toISOString() };
}

// external-analysis.js:externalHypotheses
export function externalHypotheses(data: ExternalForm, nums: Record<string, number | null>, points: any[], res: any): any[] {
  const out: any[] = [];
  const p = points.find((x) => x.bearing.key === data.spectrumPoint);
  const radial = p?.radial.length ? Math.max(...p.radial) : null;
  const samePoint = !!p && radial != null;
  const hasSpec = nums.oneX != null || nums.twoX != null || nums.axial != null || data.harmonics === "yes" || data.envelope === "bearing" || data.resonance === "yes";
  if (!hasSpec) return out;
  if (samePoint && nums.oneX != null && radial > 0 && nums.oneX >= 0.6 * radial && (!nums.twoX || nums.twoX < 0.5 * nums.oneX) && (!nums.axial || nums.axial < 0.5 * nums.oneX))
    out.push({ name: "Mất cân bằng — giả thuyết", evidence: `1X ${fmtN(nums.oneX, 2)} mm/s RMS, chiếm ≥ 60% rung hướng kính tại ${p.bearing.label}; 2X/dọc trục không nổi bật trong dữ liệu đã nhập.`, check: "Đo pha 1X ổn định theo tải/tốc độ; kiểm tra bám bẩn cánh, rô-to; cân bằng thử có kiểm soát nếu phù hợp.", confidence: "Thấp" });
  if (samePoint && nums.oneX != null && nums.twoX != null && nums.axial != null && nums.twoX >= 0.5 * nums.oneX && nums.axial >= 0.5 * nums.oneX)
    out.push({ name: "Lệch tâm / khớp nối — giả thuyết", evidence: `2X ${fmtN(nums.twoX, 2)} và dọc trục ${fmtN(nums.axial, 2)} mm/s RMS đều ≥ 50% 1X tại ${p.bearing.label}.`, check: "Đo pha hai bên khớp nối, kiểm tra chân mềm và căn tâm nóng/lạnh; loại trừ lỏng cơ khí.", confidence: "Thấp" });
  if (data.harmonics === "yes") out.push({ name: "Lỏng cơ khí / chân mềm — giả thuyết", evidence: "Người đo ghi nhận nhiều hài trên phổ.", check: "Đo phổ/waveform để phân biệt 1/2X, 1X, 2X, 3X; kiểm tra lực siết, chân máy và nền.", confidence: "Thấp" });
  if (data.envelope === "bearing") out.push({ name: "Ổ lăn / bôi trơn — giả thuyết", evidence: "Phổ bao hình có vạch nghi tần số hư ổ.", check: "Đối chiếu BPFO/BPFI/BSF/FTF từ hình học ổ, sideband và xu hướng bao hình; nghe ổ, kiểm tra bôi trơn.", confidence: "Thấp" });
  if (data.resonance === "yes") out.push({ name: "Cộng hưởng — giả thuyết", evidence: "Run-up/coast-down có đỉnh rung phụ thuộc tốc độ.", check: "Đo pha qua dải tốc độ, impact/bump test, ODS; so tần số riêng với tần số kích thích.", confidence: "Thấp" });
  if (!samePoint && (nums.oneX != null || nums.twoX != null || nums.axial != null)) out.push({ name: "Chưa ghép được phổ với rung tổng", evidence: "Thiếu điểm đo phổ hoặc chưa có rung X/Y tại đúng điểm đó.", check: "Chọn gối đo phổ và đo lại rung tổng cùng vị trí, cùng tải/tốc độ.", confidence: "Không kết luận" });
  if (!out.length && res?.level && res.level !== "normal") out.push({ name: "Chưa có mẫu chẩn đoán đủ mạnh", evidence: "Các đại lượng phổ hiện có không tạo thành một mẫu đặc trưng đáng tin cậy.", check: "Bổ sung phổ tốc độ cao hơn, pha, dạng sóng thời gian, bao hình và lịch sử so sánh.", confidence: "Không kết luận" });
  return out;
}

// ---------------- Wowk (phiếu ngoài danh mục) ----------------
// external-wowk.js:ewBearingCount / ewPointDefinitions / EW_ORDERS
export const ewBearingCount = (d: ExternalForm): 1 | 2 => (String(d.bearingCount) === "2" ? 2 : 1);
export const ewPointDefinitions = (d: ExternalForm) =>
  Array.from({ length: ewBearingCount(d) }, (_, g) => ["X · ngang", "Y · đứng", "Z · dọc trục"].map((axis, a) => ({ i: g * 3 + a, g, name: (ewBearingCount(d) === 1 ? "Gối duy nhất" : g === 0 ? "Gối 1 (NDE)" : "Gối 2 (DE)") + " · " + axis }))).flat();
export const EW_ORDERS: [string, string][] = [["0.5", "0,5× · phân hài"], ["1", "1× · tốc độ quay cơ bản"], ["1.5", "1,5×"], ["2", "2×"], ["2.5", "2,5×"], ["3", "3×"], ["4", "4×"], ["5", "5×"], ["custom", "Bậc khác"]];
export const ewOrderValue = (d: ExternalForm): number | null => { const n = Number(d.order); return Number.isFinite(n) && n > 0 ? n : null; };
// external-wowk.js:ewFrequencyHelp
export function ewFrequencyHelp(d: ExternalForm): string {
  if (d.freqMode === "fft") return "Nhập tần số của đỉnh đang xét đúng như máy phân tích FFT hiển thị; không lấy tần số lấy mẫu, tần số lưới điện hoặc dải phân tích thay cho đỉnh phổ.";
  const rpm = Number(d.rpm);
  const order = d.order === "custom" ? Number(d.customOrder) : ewOrderValue(d);
  if (!(rpm > 0)) return "Nhập tốc độ trục thực tế (vòng/phút). Chưa có RPM nên chưa thể tính Hz; không tự điền 0.";
  if (!((order as number) > 0)) return "Nhập bậc quay dương để tính tần số tương đương.";
  return `Ước tính ${order}×: ${fmtN(rpm, 2)} / 60 × ${fmtN(order, 3)} = ${fmtN((rpm / 60) * (order as number), 3)} Hz. Đây là tần số đồng bộ theo tốc độ, chưa xác nhận là đỉnh phổ đo được.`;
}
// external-wowk.js:ewAnalyze
export function ewAnalyze(d: ExternalForm): any {
  if (!String(d.name || "").trim() || !d.date) throw Error("Cần tên thiết bị và ngày đo.");
  const n = (k: string) => externalNumber(d[k], k);
  const rpm = n("rpm");
  const peak = n("peak");
  const order = d.freqMode === "fft" ? null : d.order === "custom" ? n("customOrder") : n("order") ?? 1;
  const f = d.freqMode === "fft" ? n("freq") : rpm !== null && order !== null ? (rpm / 60) * order : null;
  const row = wowkTable().find((r) => r.ma === d.row) || null;
  const points = ewPointDefinitions(d).map(({ i, g, name }) => ({ name, g, v: n(`p${i}_v`), d: n(`p${i}_d`), a: n(`p${i}_a`), t: n(`p${i}_t`), base: n(`p${i}_base`) }));
  if (!points.some((p) => [p.v, p.d, p.a].some((v) => v !== null)) && peak === null) throw Error("Cần ít nhất một giá trị rung đo được.");
  if ((f !== null && f <= 0) || (rpm !== null && rpm <= 0)) throw Error("Tần số và tốc độ phải lớn hơn 0 hoặc để trống.");
  const issues: string[] = [];
  for (let g = 0; g < ewBearingCount(d); g++) if (!points.some((p) => p.g === g && [p.v, p.d, p.a].some((v) => v !== null))) issues.push(`Gối ${g + 1} có trong cấu hình nhưng chưa có số đo rung.`);
  const rowValid = !!row && (!(row.vpm_min != null) || (rpm !== null && rpm >= row.vpm_min)) && (!(row.vpm_max != null) || (rpm !== null && rpm < row.vpm_max));
  if (!row) issues.push("Chưa chọn dòng Bảng 1: không đánh giá theo giới hạn loại máy.");
  else if (!rowValid) issues.push("Tốc độ chưa xác nhận hoặc ngoài dải dòng Bảng 1 đã chọn: không áp giới hạn dòng này.");
  if (!d.meter || !d.mount) issues.push("Thiếu thiết bị đo / cách gá: cần kiểm tra độ tin cậy và lặp lại phép đo.");
  if ((f === null) !== (peak === null)) issues.push("Hình 5 cần đủ tần số và biên độ peak của cùng thành phần phổ.");
  if (d.freqMode !== "fft" && rpm === null) issues.push("Chưa có RPM: chưa tính được tần số đồng bộ; nhập tốc độ trục thực tế hoặc chuyển sang nhập đỉnh FFT.");
  if (d.freqMode === "fft" && f !== null && !d.spectrum) issues.push("Đã nhập tần số FFT nhưng chưa ghi phương đo / tên phổ / mã bằng chứng để truy xuất.");
  const chart = TC.MD_CHART_1989;
  if (f !== null && (f < 1 || f > 1000)) issues.push("Tần số ngoài 1–1000 Hz của biểu đồ hiện có: không ngoại suy Hình 5.");
  const zone = f !== null && f >= 1 && f <= 1000 && peak !== null && chart ? vungBieuDoMd(chart, f, peak / 25.4) : null;
  const evaluated = points.map((p) => ({
    ...p,
    checks: rowValid ? ([["Vận tốc", p.v, row.van_toc_in_s_pk == null ? null : row.van_toc_in_s_pk * 25.4, "mm/s peak"], ["Dịch chuyển 1X", p.d, row.dich_chuyen_mils_pp == null ? null : row.dich_chuyen_mils_pp * 25.4, "µm p-p"], ["Gia tốc", p.a, row.gia_toc_g_pk ?? null, "g peak"]] as [string, number | null, number | null, string][]).filter(([, v, l]) => v !== null && l !== null) : [],
    ratio: d.comparable && p.v !== null && (p.base as number) > 0 ? p.v / (p.base as number) : null,
  }));
  const exceeded = evaluated.some((p) => p.checks.some(([, v, l]) => (v as number) > (l as number)));
  const causes: Record<string, [string, string, string]> = {
    radial: ["Mất cân bằng / lệch tâm / trục cong", "1X hướng kính không đặc hiệu; kiểm tra pha, độ đảo, chân mềm và tải.", "Vệ sinh rô-to; chỉ cân bằng sau khi loại trừ lỏng, cộng hưởng và xác minh mất cân bằng."],
    axial: ["Lệch đồng tâm / vấn đề khớp nối", "Đo pha hai bên khớp nối, phổ dọc trục và kiểm tra căn tâm nóng–nguội.", "Xử lý chân mềm trước; căn tâm theo dung sai nhà chế tạo sau khi xác minh."],
    harmonics: ["Lỏng cơ khí / cọ xát / phi tuyến", "Kiểm tra dạng sóng, pha, bu-lông và khe hở; phân hài không đủ để xác định riêng một lỗi.", "Siết đúng lực, sửa mối ghép hoặc khe hở đã xác nhận; đo nghiệm thu lại."],
    bearing: ["Hư hỏng ổ lăn / bôi trơn", "Đối chiếu mã ổ, hình học, tốc độ và dải bao hình; kiểm tra nhiệt, tiếng ồn, bôi trơn.", "Kiểm tra bôi trơn và lắp ghép; chỉ thay ổ khi bằng chứng và kiểm tra thực tế thống nhất."],
    resonance: ["Cộng hưởng kết cấu / rô-to", "Xác nhận đỉnh biên độ kèm biến đổi pha; thử gõ búa / ODS, loại trừ thay đổi lực kích thích.", "Sau xác minh: điều chỉnh tốc độ, độ cứng, khối lượng hoặc giảm chấn theo tính toán."],
  };
  return { d: { ...d }, rpm, f, peak, row, rowValid, points: evaluated, zone, exceeded, issues, cause: causes[d.evidence] || null, order: rpm && f ? f / (rpm / 60) : null, frequencySource: d.freqMode === "fft" ? "Đỉnh đo trực tiếp từ phổ FFT" : "Ước tính đồng bộ theo tốc độ quay", orderSelected: order };
}

// ---------------- Tóm tắt phiếu lưu (analysis-hub.js) ----------------
// analysis-hub.js:ewLevel
export function ewLevel(r: any): Level {
  const judged = r.points.some((p: any) => p.checks.length) || !!r.zone;
  if (!judged) return "na";
  if (r.zone === "EXTREMELY ROUGH") return "soon";
  if (r.exceeded || r.zone === "EXCESSIVE") return "plan";
  if (r.zone === "TOLERABLE" || r.points.some((p: any) => p.ratio >= 2)) return "watch";
  return "normal";
}
export interface SavedSummary { method: "iso" | "wowk"; name: string; location: string; date: string; person: string; level: Level; conclusion: string; standard: string; confidence: string; issues: number; data: ExternalForm }
// analysis-hub.js:saveExternalIso (phần tóm tắt)
export function summarizeExternalIso(r: any): SavedSummary {
  const d = r.data;
  return { method: "iso", name: String(d.name || "").trim(), location: String(d.location || ""), date: d.date || "", person: String(d.person || ""), level: r.res?.level || "na", conclusion: r.res ? LEVELS[r.res.level as Level].label : "Không đánh giá theo ISO", standard: r.plan?.main ? STD_SHORT[r.plan.main] || r.plan.main : "Chưa xác định", confidence: r.confidence, issues: r.issues.length, data: structuredClone(d) };
}
// analysis-hub.js:saveExternalWowk (phần tóm tắt)
export function summarizeExternalWowk(r: any): SavedSummary {
  const d = r.d;
  const lv = ewLevel(r);
  return { method: "wowk", name: String(d.name || "").trim(), location: String(d.location || ""), date: d.date || "", person: String(d.person || ""), level: lv, conclusion: lv === "na" ? "Chưa đủ dữ liệu đánh giá" : r.exceeded || ["EXCESSIVE", "EXTREMELY ROUGH"].includes(r.zone) ? "Vượt mức khảo sát Bảng 1 / Hình 5" : "Chưa vượt mức khảo sát", standard: r.rowValid ? "Bảng 1 «" + r.row.ten + "»" : "Chưa áp dòng Bảng 1", confidence: r.cause ? "Có giả thuyết: " + r.cause[0] : "Chưa có bằng chứng phổ", issues: r.issues.length, data: structuredClone(d) };
}
