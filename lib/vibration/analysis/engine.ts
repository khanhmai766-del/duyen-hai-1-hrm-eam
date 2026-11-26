/* eslint-disable @typescript-eslint/no-explicit-any */
// PHÂN TÍCH ĐỘ RUNG — tầng 1 (số tổng hằng tuần). Port từ vibracontrol/vibration-analysis.js:
// kiến trúc ISO 13374-1: DM (chất lượng số liệu) → SD (mức theo tiêu chuẩn, mức nền, tiêu chí II) → HA (giả thuyết, tối đa "Yếu") → AG (khuyến cáo).
// Chỉ khuyến cáo, không ra lệnh dừng máy. Không có mã giao diện ở đây.
import { cellNum, isNum, readCell } from "./cell";
import * as VC from "./core";
import { derivedFoundation, excitationHz, foundationOf, machineOf, type Machine } from "./machine";
import { CAUSE_ACTIONS, DEADLINE, FAN_ACTIONS, FAN_LEVEL, FAN_MUC_TEXT, HYPOTHESES, LEVELS, STD_SHORT, ZONE_LEVEL, type Level } from "./texts";
import type { AnalysisAlertConfig, AnalysisDevice, AnalysisRecord, AnalysisSettings, BearingDef } from "./types";
import { fmtN, hasReading, linFit, median, recordOrder } from "./util";
import { worseLevel } from "./level";
import { wowkEvalBearing, wowkLimits } from "./wowk";

export { worseLevel };

// vibration-analysis.js:BEARINGS
export const BEARINGS: BearingDef[] = [
  { key: "DC_KT", label: "ĐC-KT", name: "Động cơ · gối KT (NDE)", part: "motor", vx: 3, dx: 4, vy: 5, dy: 6, t: 7 },
  { key: "DC_CT", label: "ĐC-CT", name: "Động cơ · gối CT (DE)", part: "motor", vx: 8, dx: 9, vy: 10, dy: 11, t: 12 },
  { key: "QB_KT", label: "QB-KT", name: "Quạt/bơm · gối KT (NDE)", part: "machine", vx: 13, dx: 14, vy: 15, dy: 16, t: 17 },
  { key: "QB_CT", label: "QB-CT", name: "Quạt/bơm · gối CT (DE)", part: "machine", vx: 18, dx: 19, vy: 20, dy: 21, t: 22 },
];
// vibration-analysis.js:analysisDefaults
export const analysisDefaults: AnalysisSettings = { requirePerson: true, loadTolerance: 0.15, tempRise: 8, changeRatio: 0.25, baselineMin: 3, baselineMax: 5, stepRatio: 0.25 };
// vibration-analysis.js:analysisSettings (db.analysisSettings → tham số)
export const mergeSettings = (s?: Partial<AnalysisSettings> | null): AnalysisSettings => ({ ...analysisDefaults, ...(s || {}) });

// app.js:alertDefaults / ensureAlertConfig (không sửa đối tượng gốc)
export const ALERT_DEFAULTS: AnalysisAlertConfig = { enabled: true, vibration: 4.5, vibrationDanger: 7.1, temperature: 70, temperatureDanger: 85 };
export const alertOf = (d: { alertConfig?: Partial<AnalysisAlertConfig> | null }): AnalysisAlertConfig => ({ ...ALERT_DEFAULTS, ...(d.alertConfig || {}) });

// vibration-analysis.js:datedRecords
export const datedRecords = (d: AnalysisDevice): AnalysisRecord[] => d.records.filter((r) => r.date && hasReading(r)).sort(recordOrder);
// vibration-analysis.js:rgName
export const rgName = (k: string) => ({ khoi_dong: "khởi động", canh_bao: "cảnh báo", dung: "dừng" } as Record<string, string>)[k] || k;

// ---------- Chọn tiêu chuẩn cho từng gối (HD mục 3; đặc tả 5.1) ----------
// vibration-analysis.js:standardPlan
export function standardPlan(d: { machine?: Machine | null }): any {
  const m: Machine = machineOf(d.machine);
  const notes: string[] = [];
  const missing: string[] = [];
  if (!m.type) missing.push("loại máy");
  if (!m.powerKw) missing.push("công suất");
  if (!m.speedRpm) missing.push("tốc độ quay");
  const gx = foundationOf(m, "X");
  const gy = foundationOf(m, "Y");
  const listOf = (g: string) => (g === "cung" ? ["cung"] : g === "mem" ? ["mem"] : ["cung", "mem"]);
  const fX = listOf(gx);
  const fY = listOf(gy);
  const flexible = gx === "mem" && gy === "mem";
  const ready = missing.length === 0;
  const sel: any = ready
    ? VC.chonTieuChuan({ loai: m.type, cong_suat_kw: m.powerKw, toc_do_vpm: m.speedRpm, H_mm: m.shaftHeightMm, kieu_bom: m.pumpKind, gia_do: flexible ? "mem" : gx === "cung" || gy === "cung" ? "cung" : undefined })
    : { chinh: null, tham_chieu: [], ghi_chu: [] };
  if (!ready) notes.push("Thiếu " + missing.join(", ") + " → tạm dùng ngưỡng rung của thiết bị; chưa đánh giá theo bảng ISO.");
  if (ready && m.type === "quat" && m.powerKw <= 300 && m.standardOverride === "ISO_14694_2003_AMCA_204_20") {
    sel.chinh = "ISO_14694_2003_AMCA_204_20";
    sel.tham_chieu = ["ISO_20816_3_2022"];
    sel.ghi_chu = ["PXVH1 chốt ISO 14694 cho quạt này (theo nhà chế tạo); ISO 20816-3 Nhóm 2 để tham chiếu."];
  }
  notes.push(...sel.ghi_chu);
  const confirmed = m.standardConfirmed && m.standardConfirmed.id === sel.chinh;
  const scenarios = fX.length === 1 && fY.length === 1 ? [{ X: fX[0], Y: fY[0] }] : fX.join() === fY.join() ? fX.map((g) => ({ X: g, Y: g })) : fX.flatMap((a) => fY.map((b) => ({ X: a, Y: b })));
  if (fX.length > 1 || fY.length > 1) notes.push("Chưa xác định kiểu bệ" + (fX.length > 1 && fY.length > 1 ? "" : " ở một phương") + " → đánh giá cả cứng và mềm; xếp ưu tiên theo kết quả khắt khe hơn.");
  if (gx !== gy && fX.length === 1 && fY.length === 1) notes.push(`Bệ khác nhau theo phương: X ${gx === "cung" ? "cứng" : "mềm"}, Y ${gy === "cung" ? "cứng" : "mềm"} — mỗi phương đánh giá theo kiểu bệ của phương đó (R1 §5.3).`);
  const P = m.powerKw;
  const n = m.speedRpm;
  const nhom = P ? VC.nhomIso20816_3(P, m.shaftHeightMm ?? null) : null;
  if ((!m.foundation || m.foundation === "chua_xac_dinh") && derivedFoundation(m, "X")) notes.push(`Kiểu bệ suy từ tần số riêng: X ${m.natFreqX} Hz${m.natFreqY ? ", Y " + m.natFreqY + " Hz" : ""} so với 1,25 × tần số kích thích ${fmtN(excitationHz(m), 1)} Hz (R1 §5.3).`);
  if (m.orientation === "dung") notes.push("Máy trục đứng: một trong hai phương đo phải là phương có rung lớn nhất (R1 §4.2); tổ máy trục đứng thường là bệ mềm (R1 §5.3).");
  if (m.vsd === "co") notes.push("Tốc độ thay đổi: đo ở mọi chế độ vận hành kéo dài và lấy giá trị lớn nhất (R1 §4.5); so tiêu chí II chỉ giữa các lần đo cùng tốc độ/tải.");
  if (m.type === "dong_co" && m.coupling === "noi_cung") notes.push("Động cơ nối cứng với máy được kéo: có thể đánh giá theo phần tiêu chuẩn của máy đó hoặc theo ISO 20816-3 (R1 §1 f).");
  if (["dai", "hop_so"].includes(m.coupling)) notes.push("Truyền " + (m.coupling === "dai" ? "đai" : "qua hộp số") + ": rung có thành phần tần số đai/ăn khớp — số tổng không tách được; cần phổ khi chẩn đoán (R1 §6.7).");
  if (n && n < 600) notes.push("Tốc độ < 600 v/p: thiết bị đo phải có dải phẳng xuống 2 Hz và đánh giá cả dịch chuyển (R1 §4.3, Phụ lục A).");
  const iso3 = (role: string): any => ({ id: "ISO_20816_3_2022", role, nhom, n, label: STD_SHORT.ISO_20816_3_2022 + " Nhóm " + nhom });
  let forPart: (part: string) => any[] = () => [];
  if (sel.chinh && P) {
    if (sel.chinh === "ISO_14694_2003_AMCA_204_20") {
      const bv = VC.hangBvQuat(VC.TC[sel.chinh], P);
      forPart = () => [{ id: sel.chinh, role: "chính", bv, label: STD_SHORT[sel.chinh] + " " + bv }, { ...iso3("tham chiếu"), note: flexible ? "R1 không áp dụng cho quạt trên gối đàn hồi (§1 Chú thích 3)" : "R1 §1 Chú thích 3" }];
    } else if (sel.chinh === "ISO_10816_7_2009" && m.coupling === "lien_truc") {
      notes.push("Bơm liền trục động cơ: đánh giá cả cụm (cả gối động cơ) theo ISO 10816-7 (R1 §1 o).");
      forPart = () => [{ id: sel.chinh, role: "chính", loai: "I", P, label: STD_SHORT[sel.chinh] + " Loại I " + (P <= 200 ? "≤ 200 kW" : "> 200 kW") + " (cả cụm)" }];
    } else if (sel.chinh === "ISO_10816_7_2009") {
      forPart = (part) => (part === "machine" ? [{ id: sel.chinh, role: "chính", loai: "I", P, label: STD_SHORT[sel.chinh] + " Loại I " + (P <= 200 ? "≤ 200 kW" : "> 200 kW") }] : P > 15 ? [{ ...iso3("chính"), note: "động cơ rời của bơm (R1 §1 f)" }] : []);
    } else if (sel.chinh === "ISO_20816_3_2022") {
      forPart = () => {
        const out = [iso3("chính")];
        if (m.type === "quat") {
          const bv = VC.hangBvQuat(VC.TC.ISO_14694_2003_AMCA_204_20, P);
          out.push({ id: "ISO_14694_2003_AMCA_204_20", role: "tham chiếu", bv, label: STD_SHORT.ISO_14694_2003_AMCA_204_20 + " " + bv });
        }
        return out;
      };
    } else if (sel.chinh === "ISO_20816_2_2017") {
      forPart = () => [{ id: sel.chinh, role: "chính", n, label: STD_SHORT[sel.chinh] }];
    } else notes.push(STD_SHORT[sel.chinh] + " chỉ dùng cho thử tại xưởng — không đánh giá tại chỗ.");
  }
  return { main: sel.chinh, confirmed, scenarios, foundations: [...new Set([...fX, ...fY])], forPart, notes, missing, f1x: n ? n / 60 : null, machine: m };
}

// vibration-analysis.js:evaluateStd — đánh giá một gối theo một tiêu chuẩn. level theo HD mục 8.1 / 9.1.
export function evaluateStd(ev: any, giaDo: any, v: number, dRms: number | null): any {
  const tc = VC.TC[ev.id];
  if (ev.id === "ISO_14694_2003_AMCA_204_20") {
    const r = VC.danhGiaQuatBv(tc, ev.bv, giaDo, [v]);
    const i = (VC.MUC_QUAT as readonly string[]).indexOf(r.muc);
    return { kind: "fan", text: FAN_MUC_TEXT[r.muc], level: FAN_LEVEL[i], fanIndex: i, near: r.sat_ranh_gioi, rg: r.ranh_gioi, coSo: r.ranh_gioi.canh_bao, alarm: r.ranh_gioi.canh_bao, trip: r.ranh_gioi.dung };
  }
  let r: any;
  if (ev.id === "ISO_20816_3_2022") r = VC.danhGiaIso20816_3(tc, ev.nhom, giaDo, [v], dRms != null ? [dRms] : []);
  else if (ev.id === "ISO_10816_7_2009") r = VC.danhGiaBomIso10816_7(tc, ev.loai, ev.P, [v]);
  else r = VC.danhGiaIso20816_2ThanO(tc, ev.n, [v]);
  const trip = VC.tranTrip(r.ranh_gioi["C/D"]);
  const level = v > trip ? "stop" : ZONE_LEVEL[r.vung];
  return { kind: "zone", zone: r.vung, zoneV: r.vung_van_toc, zoneD: r.vung_dich_chuyen, text: "Vùng " + r.vung + (r.vung_dich_chuyen && r.vung !== r.vung_van_toc ? " (do dịch chuyển; vận tốc: vùng " + r.vung_van_toc + ")" : ""), level, near: r.sat_ranh_gioi, rg: r.ranh_gioi, coSo: r.ranh_gioi["B/C"], trip };
}

// vibration-analysis.js:vibrationLimitFor — ngưỡng cảnh báo hiển thị: ISO khi đủ thông số, ngược lại ngưỡng nội bộ / Wowk.
export function vibrationLimitFor(d: { machine?: Machine | null; alertConfig?: Partial<AnalysisAlertConfig> | null }, part: string, dir: "X" | "Y", plan: any = standardPlan(d)): { warn: number | null; danger: number | null; source: string; iso: boolean } {
  const a = alertOf(d);
  const fallback = { warn: a.vibration as number | null, danger: a.vibrationDanger as number | null, source: "Ngưỡng tạm của thiết bị", iso: false };
  const ev = plan.forPart(part).find((x: any) => x.role === "chính");
  if (!ev) {
    const w = wowkLimits(d.machine || {});
    return w && Number.isFinite(w.warn) && Number.isFinite(w.danger) ? { ...w, iso: false } : fallback;
  }
  try {
    const bounds = plan.scenarios.map((sc: any) => evaluateStd(ev, sc[dir], 0, null).rg);
    const warn = Math.min(...bounds.map((r: any) => r["B/C"] ?? r.canh_bao));
    const danger = Math.min(...bounds.map((r: any) => r["C/D"] ?? r.dung));
    return Number.isFinite(warn) && Number.isFinite(danger) ? { warn, danger, source: ev.label, iso: true } : fallback;
  } catch {
    return fallback;
  }
}

// vibration-analysis.js:evalBearing — đánh giá một gối theo một tiêu chuẩn và một kịch bản bệ {X,Y} (R1 §5.3, §6.2.1).
export function evalBearing(ev: any, sc: any, bv: any, _plan?: any): any {
  const tc = VC.TC[ev.id];
  const noFnd = ev.id === "ISO_10816_7_2009" || ev.id === "ISO_20816_2_2017";
  const per: any[] = [];
  for (const dir of ["X", "Y"] as const) {
    const v = dir === "X" ? bv.vx : bv.vy;
    if (v == null) continue;
    const g = noFnd ? null : sc[dir];
    let dRms: number | null = null;
    let dispNote = "";
    const dd = dir === "X" ? bv.dRmsX : bv.dRmsY;
    const f = dir === "X" ? bv.fx : bv.fy;
    if (ev.id === "ISO_20816_3_2022" && dd != null) {
      if (VC.apDungDichChuyen(tc, ev.nhom, ev.n, f)) dRms = dd;
      else {
        const ref = VC.danhGiaIso20816_3(tc, ev.nhom, g, [v], [dd]);
        if (ref.vung_dich_chuyen && (VC.ZONES as readonly string[]).indexOf(ref.vung_dich_chuyen) > (VC.ZONES as readonly string[]).indexOf(ref.vung_van_toc)) dispNote = `dịch chuyển ${fmtN(dd, 0)} µm RMS ứng vùng ${ref.vung_dich_chuyen} — chỉ tham khảo (≥ 600 v/p, tần số không thấp; R1 Phụ lục A)`;
      }
    }
    per.push({ dir, g, v, dispNote, ...evaluateStd(ev, g, v, dRms) });
  }
  if (!per.length) return null;
  const worst = per.reduce((a, b) => (LEVELS[b.level as Level].rank > LEVELS[a.level as Level].rank || (LEVELS[b.level as Level].rank === LEVELS[a.level as Level].rank && b.v > a.v) ? b : a));
  const gTxt = noFnd ? null : sc.X === sc.Y ? sc.X : `X ${sc.X === "cung" ? "cứng" : "mềm"} / Y ${sc.Y === "cung" ? "cứng" : "mềm"}`;
  return { ...worst, g: gTxt, per, text: per.length > 1 ? per.map((p) => `${p.dir}: ${p.text}`).join(" · ") : `${worst.dir}: ${worst.text}` };
}

// ---------- DM: kiểm tra chất lượng một bản ghi (đặc tả mục 4, Q1–Q10) ----------
// vibration-analysis.js:qualityCheck / qualityCheckRaw (không có bộ nhớ đệm — chỉ để tăng tốc ở bản cũ)
export function qualityCheck(d: AnalysisDevice, r: AnalysisRecord, prev: AnalysisRecord | null | undefined, f1x: number | null | undefined): any {
  const flags: any[] = [];
  const cells: Record<number, string> = {};
  const vals = r.values || [];
  const add = (q: string, level: string, msg: string, idx?: number) => {
    flags.push({ q, level, msg, idx });
    if (idx != null && level === "loi") cells[idx] = "loi";
  };
  const read = vals.map((raw, i) => {
    const c = readCell(raw);
    if (c.flag === "giai_ma_ngay" || c.flag === "giai_ma_gio") add("Q1", "canh_bao", `Ô «${raw}» bị lưu thành ngày/giờ → giải mã ${fmtN(c.value, 3)}`, i);
    if (c.flag === "chu_so") add("Q2", "thong_tin", `Ô «${raw}» là chữ → đọc ${fmtN(c.value, 3)}`, i);
    if (c.flag === "can_xac_nhan") add("Q1", "loi", `Ô «${raw}» không đọc được — cần người nhập xác nhận`, i);
    return c.value;
  });
  const amps = [0, 1, 2].map((i) => read[i]).filter((x): x is number => x != null);
  const nums = read.filter((x) => x != null);
  const stopped = nums.length > 0 && (nums.every((x) => x === 0) || (amps.length > 0 && amps.every((x) => x === 0)));
  if (stopped) add("Q3", "thong_tin", "Máy dừng / dự phòng (dòng = 0 hoặc mọi số = 0) → không đánh giá, không coi 0 là số đo");
  if (!r.date || !r.person) add("Q8", "canh_bao", (!r.date ? "Thiếu ngày đo" : "Thiếu người đo") + " → không dùng làm mức nền");
  if (amps.length === 3) {
    const mean = (amps[0] + amps[1] + amps[2]) / 3;
    if (mean > 0 && amps.some((a) => Math.abs(a - mean) > 0.1 * mean)) add("Q9", "canh_bao", "Lệch dòng 3 pha > 10 % so trung bình (thường do nhập sai một pha)");
  }
  const units: Record<number, string> = {};
  if (!stopped) {
    const vIdx = BEARINGS.flatMap((b) => [b.vx, b.vy]).filter((i) => read[i] != null);
    for (const b of BEARINGS)
      for (const [vi, di, dir] of [[b.vx, b.dx, "X"], [b.vy, b.dy, "Y"]] as [number, number, string][]) {
        const v = read[vi];
        const dd = read[di];
        if (v == null) continue;
        if (v > 100) add("Q10", "loi", `${b.label} ${dir}: vận tốc ${fmtN(v)} mm/s > 100 — phi lý`, vi);
        if (dd != null && v > 0 && dd > 0) {
          if (VC.nghiDaoCot(v, dd, f1x)) {
            add("Q5", "loi", `${b.label} ${dir}: nghi đảo cột vận tốc ↔ biên độ (${fmtN(v)} / ${fmtN(dd, 3)})`, vi);
            cells[di] = "loi";
            continue;
          }
          const u = VC.chonDonViBienDo(v, dd, f1x);
          units[di] = u;
          if (u === "mm") add("Q4", "canh_bao", `${b.label} ${dir}: biên độ ${fmtN(dd, 3)} ghi theo mm → hiểu là ${fmtN(dd * 1000, 0)} µm`, di);
        }
        const others = vIdx.filter((i) => i !== vi).map((i) => read[i] as number);
        const med = median(others);
        if (others.length >= 3 && (med as number) > 0 && v > 5 * (med as number)) add("Q6", "loi", `${b.label} ${dir}: ${fmtN(v)} mm/s gấp > 5 lần trung vị các điểm khác (${fmtN(med)}) — nghi thiếu dấu thập phân, gợi ý ${fmtN(v / 10, 2)}. Không tự sửa.`, vi);
      }
    for (const b of BEARINGS) {
      const t = read[b.t];
      if (t != null && (t < 0 || t > 150)) add("Q10", "loi", `${b.label}: nhiệt độ ${fmtN(t)} °C ngoài 0–150 °C`, b.t);
    }
  }
  // Q11 — nghi nhập đảo gối KT ↔ CT cùng cụm.
  if (prev && !stopped) {
    const a = (prev.values || []).map(cellNum);
    const near = (x: number | null, y: number | null) => x != null && y != null && y > 0 && Math.abs(x - y) <= 0.15 * y;
    for (const [kt, ct] of [[BEARINGS[0], BEARINGS[1]], [BEARINGS[2], BEARINGS[3]]])
      for (const k of ["vx", "vy"] as const) {
        const n1 = read[kt[k]], n2 = read[ct[k]], p1 = a[kt[k]], p2 = a[ct[k]];
        if (near(n1, p2) && near(n2, p1) && (p1 as number) > 0 && (p2 as number) > 0 && Math.abs((p1 as number) - (p2 as number)) > 0.3 * Math.max(p1 as number, p2 as number))
          add("Q11", "canh_bao", `${kt.label}/${ct.label} ${k === "vx" ? "X" : "Y"}: ${fmtN(p1)}/${fmtN(p2)} → ${fmtN(n1)}/${fmtN(n2)} mm/s — hai gối đổi chỗ số cho nhau, nghi nhập đảo cột KT ↔ CT. Kiểm tra lại số nhập trước khi kết luận.`);
      }
  }
  if (prev) {
    const a = (prev.values || []).map(cellNum);
    const same = read.every((x, i) => x === a[i]);
    const count = read.filter((x) => x != null && x !== 0).length;
    if (same && count >= 4) add("Q7", "canh_bao", "Mọi giá trị trùng khít lần đo trước (" + prev.date + ") — nghi chép lại, cần xác nhận");
  }
  return { flags, cells, read, units, stopped, amps };
}

// vibration-analysis.js:meanCurrent
export const meanCurrent = (q: any): number | null => (q.amps.length ? q.amps.reduce((a: number, b: number) => a + b, 0) / q.amps.length : null);

// vibration-analysis.js:bearingValues
export function bearingValues(q: any, b: BearingDef): any {
  const ok = (i: number) => q.read[i] != null && q.cells[i] !== "loi";
  const vx = ok(b.vx) ? q.read[b.vx] : null;
  const vy = ok(b.vy) ? q.read[b.vy] : null;
  const dUm = (di: number) => {
    if (!ok(di)) return null;
    const u = q.units[di];
    return u === "mm" ? q.read[di] * 1000 : u === "um" ? q.read[di] : null;
  };
  const dx = dUm(b.dx);
  const dy = dUm(b.dy);
  const v = [vx, vy].filter((x) => x != null);
  const ds = [dx, dy].filter((x) => x != null);
  return {
    vx, vy, v: v.length ? Math.max(...v) : null, ratio: vx > 0 && vy > 0 ? Math.max(vx, vy) / Math.min(vx, vy) : null,
    dRms: ds.length ? VC.pkpkSangRms(Math.max(...ds)) : null, dRmsX: dx != null ? VC.pkpkSangRms(dx) : null, dRmsY: dy != null ? VC.pkpkSangRms(dy) : null,
    fx: vx && dx ? VC.tanSoTuongDuong(vx, dx / 1000) : null, fy: vy && dy ? VC.tanSoTuongDuong(vy, dy / 1000) : null, t: ok(b.t) ? q.read[b.t] : null,
  };
}

// ---------- Phân tích một bản ghi ----------
export interface AnalyzeOpts {
  plan?: any;
  history?: AnalysisRecord[];
  settings?: Partial<AnalysisSettings> | null;
}
// vibration-analysis.js:analyzeRecord / analyzeRecordCore — KẾT LUẬN DUY NHẤT của mọi menu (Q3).
export function analyzeRecord(d: AnalysisDevice, r: AnalysisRecord, opts: AnalyzeOpts = {}): any {
  const s = mergeSettings(opts.settings);
  const plan = opts.plan || standardPlan(d);
  const all = opts.history || datedRecords(d);
  const idx = all.indexOf(r);
  const before = idx >= 0 ? all.slice(0, idx) : all.filter((x) => recordOrder(x, r) < 0);
  const q = qualityCheck(d, r, before.at(-1), plan.f1x);
  const res: any = { d, r, plan, q, bearings: [], hyps: [], level: "na", needs: [], notes: [...plan.notes], settings: s };
  if (q.stopped) {
    res.levelText = "Máy dừng / dự phòng";
    return res;
  }
  const from = d.analysis?.baselineFrom || "";
  const curA = meanCurrent(q);
  const prior = before.filter((x) => x.date && (!from || x.date >= from)).map((x) => ({ x, q: qualityCheck(d, x, null, plan.f1x) })).filter((p) => !p.q.stopped && (p.x.person || !s.requirePerson));
  const runs = before.map((x) => ({ x, q: qualityCheck(d, x, null, plan.f1x) })).filter((p) => !p.q.stopped);
  res.runs = runs;
  const lastRunning = runs.at(-1);
  {
    const cur = q.read;
    for (const p of runs.slice(-3).reverse()) {
      let both = 0, eq = 0;
      cur.forEach((x: number | null, i: number) => {
        const y = p.q.read[i];
        if (x != null && y != null && x !== 0) {
          both++;
          if (x === y) eq++;
        }
      });
      if (both >= 6 && eq / both >= 0.8 && !q.flags.some((f: any) => f.q === "Q7")) {
        q.flags.push({ q: "Q7", level: "canh_bao", msg: `${eq}/${both} giá trị trùng khít lần đo ${p.x.date} — nghi chép lại số cũ, cần xác nhận đã đo thực tế` });
        break;
      }
    }
  }
  for (const b of BEARINGS) {
    const bv = bearingValues(q, b);
    if (bv.v == null && bv.t == null) continue;
    const row: any = { b, ...bv, evals: [] };
    const evs = plan.forPart(b.part);
    if (bv.v != null) {
      if (evs.length) {
        for (const ev of evs)
          for (const sc of plan.scenarios) {
            try {
              const e = evalBearing(ev, sc, bv, plan);
              if (e) row.evals.push({ ev, ...e });
            } catch (err: any) {
              row.evals.push({ ev, g: null, error: err.message });
            }
          }
      } else if (wowkEvalBearing(d, bv, plan)) {
        row.evals.push(wowkEvalBearing(d, bv, plan));
        if (!res.notes.some((n: string) => n.startsWith("ISO không đủ"))) res.notes.push("ISO không đủ thông tin" + (plan.missing.length ? " (thiếu " + plan.missing.join(", ") + ")" : " (máy ngoài phạm vi ISO 20816-3)") + " → đánh giá theo tài liệu Wowk: Bảng 1 và Hình 5 [WOWK tr.3, tr.8]. Xem tab «Thiết bị trong danh mục», phương pháp «Tài liệu Wowk».");
      } else {
        const a = alertOf(d);
        const lv = bv.v >= a.vibrationDanger ? "soon" : bv.v >= a.vibration ? "plan" : "normal";
        row.evals.push({ ev: { role: "chính", label: "Ngưỡng nội bộ của thiết bị (chưa chọn tiêu chuẩn)" }, kind: "internal", text: lv === "normal" ? "Dưới ngưỡng cảnh báo" : lv === "plan" ? "Vượt ngưỡng cảnh báo" : "Vượt ngưỡng nguy hiểm", level: lv, near: [], rg: { "cảnh báo": a.vibration, "nguy hiểm": a.vibrationDanger }, coSo: a.vibration, trip: null });
      }
      const mainEvals = row.evals.filter((e: any) => e.ev.role === "chính" && !e.error);
      row.mainLevel = mainEvals.reduce((l: Level, e: any) => worseLevel(l, e.level), "na" as Level);
      row.coSo = Math.min(...mainEvals.map((e: any) => e.coSo).filter(Number.isFinite));
      const zoneEval = mainEvals.filter((e: any) => e.kind === "zone").sort((a: any, b2: any) => a.rg["B/C"] - b2.rg["B/C"])[0];
      const cands = prior.map((p) => ({ p, bv: bearingValues(p.q, b), a: meanCurrent(p.q) })).filter((c) => curA == null || c.a == null || Math.abs(c.a - curA) <= s.loadTolerance * curA);
      const prevBv = lastRunning ? bearingValues(lastRunning.q, b) : null;
      row.dirs = {};
      for (const dir of ["X", "Y"] as const) {
        const key = dir === "X" ? "vx" : "vy";
        const v = bv[key];
        if (v == null) continue;
        const o: any = { v };
        const base = cands.filter((c) => c.bv[key] != null).slice(-s.baselineMax);
        if (base.length >= s.baselineMin) {
          o.base = median(base.map((c) => c.bv[key]));
          o.baseN = base.length;
          o.baseFrom = base[0].p.x.date;
          o.baseTo = base.at(-1)!.p.x.date;
          o.baseAmp = base.some((c) => c.a != null);
          if (Number.isFinite(row.coSo)) {
            o.crit = VC.tieuChiII(o.base, v, row.coSo, s.changeRatio);
            o.wowk = VC.tySoWowk(o.base, v);
            if (zoneEval) o.alarm = VC.datAlarm(o.base, zoneEval.rg["B/C"]);
          }
        } else o.baseMissing = `chưa đủ ${s.baselineMin} lần đo hợp lệ (có ${base.length})`;
        if (prevBv?.[key] != null && Number.isFinite(row.coSo)) {
          o.prevV = prevBv[key];
          const lim = s.stepRatio * row.coSo;
          const hist = runs.map((p) => bearingValues(p.q, b)[key]).filter((x: any) => x != null).slice(-5);
          const ref = hist.length >= 3 ? (median(hist) as number) : o.prevV;
          const hi = hist.length ? Math.max(...hist) : o.prevV;
          if (v - o.prevV > lim && v - ref > lim && v > hi + 0.1 * row.coSo) o.step = true;
          else if (v - o.prevV > lim) o.rebound = true;
        }
        row.dirs[dir] = o;
      }
      const ds = Object.entries<any>(row.dirs);
      const pick = ds.filter(([, o]) => o.crit).sort(([, a], [, b2]) => Math.abs(b2.crit.delta) / b2.crit.nguong - Math.abs(a.crit.delta) / a.crit.nguong)[0];
      if (pick) {
        const [dir, o] = pick;
        Object.assign(row, { critDir: dir, base: o.base, baseN: o.baseN, baseFrom: o.baseFrom, baseTo: o.baseTo, baseAmp: o.baseAmp, crit: o.crit, wowk: o.wowk });
      } else row.baseMissing = ds.map(([, o]) => o.baseMissing).find(Boolean);
      const stepDir = ds.find(([, o]) => o.step);
      if (stepDir) { row.step = true; row.stepDir = stepDir[0]; row.prevV = stepDir[1].prevV; row.stepV = stepDir[1].v; }
      const rb = ds.find(([, o]) => o.rebound);
      if (rb) row.rebound = { dir: rb[0], prevV: rb[1].prevV, v: rb[1].v };
      const alarmHit = ds.find(([, o]) => o.alarm != null && o.v > o.alarm);
      if (alarmHit) row.alarmHit = { dir: alarmHit[0], v: alarmHit[1].v, alarm: alarmHit[1].alarm };
      row.alarm = Math.min(...ds.map(([, o]) => o.alarm).filter(Number.isFinite));
      if (!Number.isFinite(row.alarm)) row.alarm = null;
      // Rung nền (R1 §4.6)
      const bgBc = zoneEval ? zoneEval.rg["B/C"] : row.coSo;
      const stoppedRec = [...before].reverse().slice(0, 20).map((x) => ({ x, q: qualityCheck(d, x, null, plan.f1x) })).find((p) => p.q.stopped && bearingValues(p.q, b).v > 0);
      if (stoppedRec && Number.isFinite(bgBc)) {
        const vStop = bearingValues(stoppedRec.q, b).v;
        row.bg = { vStop, date: stoppedRec.x.date, ...VC.rungNen(vStop, bv.v, bgBc) };
      }
      // Nghiệm thu sau sửa chữa (R1 §6.2.3)
      if (from && r.date! >= from && !before.some((x) => x.date! >= from && !qualityCheck(d, x, null, plan.f1x).stopped)) {
        if (zoneEval) row.accept = { ...VC.nghiemThu(bv.v, zoneEval.rg["A/B"]), rule: "≤ 1,25 × A/B" };
        else {
          const fan = mainEvals.find((e: any) => e.kind === "fan");
          if (fan) row.accept = { gioi_han: fan.rg.khoi_dong, dat: bv.v <= fan.rg.khoi_dong, rule: "≤ mức khởi động (ISO 14694)" };
        }
      }
    }
    // Nhiệt độ gối (đặc tả 5.2)
    if (bv.t != null) {
      const a = alertOf(d);
      const tb = prior.map((p) => bearingValues(p.q, b).t).filter((x: any) => x != null).slice(-s.baselineMax);
      row.tLevel = bv.t >= a.temperatureDanger ? "soon" : bv.t >= a.temperature ? "watch" : "normal";
      if (tb.length >= s.baselineMin) {
        row.tBase = median(tb);
        row.tRise = bv.t - row.tBase >= s.tempRise;
      }
    }
    res.bearings.push(row);
  }
  // ---------- Mức hành động (HD bản 4 mục 8.1) ----------
  let level: Level = "na";
  const why: string[] = [];
  for (const row of res.bearings) {
    if (row.mainLevel && row.mainLevel !== "na") level = worseLevel(level, row.mainLevel);
    if (row.crit?.dang_ke && row.crit.delta > 0 && LEVELS[level].rank < 2) {
      level = "watch";
      why.push(`${row.b.label} ${row.critDir}: tăng ${fmtN(row.crit.delta, 2)} mm/s so mức nền cùng phương > ${Math.round(s.changeRatio * 100)} % cơ sở (tiêu chí II, R1 §6.3)`);
    }
    if (row.alarmHit) {
      level = worseLevel(level, "soon");
      why.push(`${row.b.label} ${row.alarmHit.dir}: ${fmtN(row.alarmHit.v)} mm/s vượt ALARM khuyến nghị ${fmtN(row.alarmHit.alarm, 2)} (nền + 25 % B/C, R1 §6.5.2)`);
    }
    if (row.step) {
      const high = Number.isFinite(row.coSo) && row.stepV >= row.coSo;
      level = worseLevel(level, high ? "soon" : "watch");
      why.push(`${row.b.label} ${row.stepDir}: tăng đột bậc ${fmtN(row.prevV)} → ${fmtN(row.stepV)} mm/s, vượt mọi lần đo gần đây (R1 §6.3)${high ? "" : " — vẫn dưới ngưỡng " + fmtN(row.coSo, 2) + " mm/s nên xếp Theo dõi, cần đo lại xác nhận"}`);
    }
    if (row.tRise) {
      level = worseLevel(level, "soon");
      why.push(`${row.b.label}: nhiệt gối ${fmtN(row.t, 0)} °C, tăng ≥ ${s.tempRise} °C so mức nền ${fmtN(row.tBase, 0)} °C`);
    }
    if (row.tLevel && row.tLevel !== "normal") {
      level = worseLevel(level, row.tLevel);
      why.push(`${row.b.label}: nhiệt gối ${fmtN(row.t, 0)} °C ≥ ngưỡng ${row.tLevel === "soon" ? "nguy hiểm" : "cảnh báo"} của thiết bị`);
    }
  }
  res.level = res.bearings.some((x: any) => x.v != null || x.t != null) ? level : "na";
  res.why = why;
  const worst = res.bearings.filter((x: any) => x.v != null).sort((a: any, b2: any) => LEVELS[b2.mainLevel as Level].rank - LEVELS[a.mainLevel as Level].rank || b2.v - a.v)[0];
  res.worst = worst;
  if (LEVELS[res.level as Level].rank >= 3) {
    const prevRes = lastRunning ? analyzeRecordLevelOnly(d, lastRunning.x, plan) : null;
    res.unconfirmed = !prevRes || LEVELS[prevRes as Level].rank < 3;
  }
  hypotheses(res, s);
  needs(res);
  return res;
}
// vibration-analysis.js:analyzeRecordLevelOnly
export function analyzeRecordLevelOnly(d: AnalysisDevice, r: AnalysisRecord, plan: any): Level {
  const q = qualityCheck(d, r, null, plan.f1x);
  if (q.stopped) return "na";
  let lv: Level = "na";
  for (const b of BEARINGS) {
    const bv = bearingValues(q, b);
    if (bv.v == null) continue;
    for (const ev of plan.forPart(b.part).filter((e: any) => e.role === "chính"))
      for (const sc of plan.scenarios) {
        try {
          const e = evalBearing(ev, sc, bv, plan);
          if (e) lv = worseLevel(lv, e.level);
        } catch { /* như bản gốc: bỏ qua lỗi tra bảng */ }
      }
    if (!plan.forPart(b.part).length) {
      const a = alertOf(d);
      lv = worseLevel(lv, bv.v >= a.vibrationDanger ? "soon" : bv.v >= a.vibration ? "plan" : "normal");
    }
  }
  return lv;
}

// ---------- HA: giả thuyết tầng 1 (đặc tả 6.1) — mức khớp tối đa "Yếu" ----------
// vibration-analysis.js:hypotheses
function hypotheses(res: any, s: AnalysisSettings) {
  const { bearings: bs, plan, q, r } = res;
  const f1x = plan.f1x;
  const H = (id: string, evidence: string, score = 1) => res.hyps.push({ id, ...HYPOTHESES[id], evidence, score, match: "Yếu" });
  const withV = bs.filter((x: any) => x.v != null);
  if (!withV.length) return;
  const abnormal = LEVELS[res.level as Level].rank >= 3 || bs.some((x: any) => x.step);
  if (q.flags.some((f: any) => f.level === "loi")) H("H0", "Bản ghi có ô lỗi dữ liệu (" + q.flags.filter((f: any) => f.level === "loi").map((f: any) => f.q).join(", ") + ") — các ô này không dùng để đánh giá.");
  else if (abnormal && !r.person) H("H0", "Lần đo bất thường nhưng không ghi người đo — cần loại trừ sai lệch phép đo trước khi kết luận.");
  const top = withV.reduce((a: any, b: any) => (b.v > a.v ? b : a));
  const low = (x: any) => {
    const e = x.evals.find((e2: any) => e2.ev.role === "chính" && e2.rg);
    return e ? e.rg["A/B"] ?? e.rg.khoi_dong ?? e.rg["cảnh báo"] ?? (e.rg["Wowk Bảng 1"] != null ? e.rg["Wowk Bảng 1"] / 2 : 0) : 0;
  };
  if (f1x) {
    const fs = withV.flatMap((x: any) => [x.fx, x.fy]).filter((x: any) => x != null);
    const near = fs.filter((f: number) => f >= 0.8 * f1x && f <= 1.3 * f1x);
    if (fs.length >= 2 && near.length > fs.length / 2 && top.ratio != null && top.ratio < 1.5) H("H1", `f_tđ ≈ 1X (0,8–1,3 × ${fmtN(f1x)} Hz) ở ${near.length}/${fs.length} điểm; gối lớn nhất ${top.b.label} có X/Y = ${fmtN(top.ratio, 2)} < 1,5.`);
    const hi = withV.filter((x: any) => [x.fx, x.fy].some((f: any) => f != null && f >= 1.6 * f1x) && x.v > low(x));
    if (hi.length) H("H4", hi.map((x: any) => `${x.b.label}: f_tđ ${[x.fx, x.fy].filter((f: any) => f != null).map((f: number) => fmtN(f) + " Hz (" + fmtN(f / f1x, 1) + "X)").join(" / ")}`).join("; ") + " ≥ 1,6X.");
  }
  const dc = bs.find((x: any) => x.b.key === "DC_CT");
  const qb = bs.find((x: any) => x.b.key === "QB_CT");
  if (dc?.v != null && qb?.v != null && LEVELS[res.level as Level].rank >= 2 && Math.min(dc.v, qb.v) >= 0.8 * top.v && [dc.ratio, qb.ratio].some((x: any) => x != null && x >= 1.5))
    H("H2", `Hai gối sát khớp nối ĐC-CT ${fmtN(dc.v)} và QB-CT ${fmtN(qb.v)} mm/s cùng cao (≥ 80 % gối lớn nhất — quy ước của phần mềm); X ≠ Y. Cần đo dọc trục để xác nhận.`);
  const dir = withV.filter((x: any) => x.ratio != null && x.ratio >= 2.5 && x.v > low(x));
  if (dir.length) H("H3", dir.map((x: any) => `${x.b.label}: X ${fmtN(x.vx)} / Y ${fmtN(x.vy)} mm/s, tỉ lệ ${fmtN(x.ratio, 1)} ≥ 2,5`).join("; ") + " — rung định hướng rõ.");
  const hot = bs.filter((x: any) => x.tRise && ((x.crit?.delta > 0 && x.crit.dang_ke) || x.step || bs.some((y: any) => y.crit?.dang_ke && y.crit.delta > 0)));
  if (hot.length) H("H5", hot.map((x: any) => `${x.b.label}: nhiệt ${fmtN(x.t, 0)} °C (nền ${fmtN(x.tBase, 0)} °C)`).join("; ") + " tăng cùng lúc với rung.");
  const curA = meanCurrent(q);
  const chg = bs.filter((x: any) => x.crit?.dang_ke);
  if (curA != null && chg.length) {
    const baseA = median(datedRecords(res.d).filter((x) => recordOrder(x, r) < 0).map((x) => meanCurrent(qualityCheck(res.d, x, null, f1x))).filter((a) => (a as number) > 0).slice(-5) as number[]);
    if (baseA && Math.abs(curA - baseA) > s.loadTolerance * baseA) H("H6", `Rung đổi đáng kể trong khi dòng điện ${fmtN(curA, 0)} A lệch > ${Math.round(s.loadTolerance * 100)} % so các lần trước (${fmtN(baseA, 0)} A).`);
  }
  const bgRows = bs.filter((x: any) => x.bg?.dang_ke);
  if (bgRows.length) H("H7", bgRows.map((x: any) => `${x.b.label}: khi máy dừng (${x.bg.date}) rung ${fmtN(x.bg.vStop, 2)} mm/s > ${fmtN(x.bg.nguong, 2)}`).join("; ") + " — rung nền đáng kể, R1 chỉ đánh giá rung do chính máy sinh ra.");
  historyHypotheses(res, H, withV, s);
  // Lỗi đo luôn xếp đầu (HD mục 7.1 hàng 0), sau đó theo số bằng chứng độc lập.
  res.hyps.sort((a: any, b: any) => Number(b.id === "H0") - Number(a.id === "H0") || (b.score || 1) - (a.score || 1));
}

// ---------- Giả thuyết từ phân bố gối và LỊCH SỬ số đo ----------
// vibration-analysis.js:historyHypotheses
function historyHypotheses(res: any, H: (id: string, ev: string, score?: number) => void, withV: any[], s: AnalysisSettings) {
  const { bearings: bs, q, r, d } = res;
  const runs = res.runs || [];
  const abnormal = LEVELS[res.level as Level].rank >= 2;
  const day = (x: string) => Date.parse(x + "T00:00:00Z") / 864e5;
  const series = (b: BearingDef) => [...runs.map((p: any) => ({ date: p.x.date, person: (p.x.person || "").trim(), v: bearingValues(p.q, b).v })), { date: r.date, person: (r.person || "").trim(), v: bearingValues(q, b).v }].filter((p: any) => p.v != null && p.date);
  const swap = q.flags.filter((f: any) => f.q === "Q11");
  if (swap.length) {
    const h0 = res.hyps.find((h: any) => h.id === "H0");
    const t = swap.map((f: any) => f.msg).join(" ");
    if (h0) { h0.evidence += " " + t; h0.score = 3; } else H("H0", t, 3);
  }
  const side = (part: string) => withV.filter((x) => x.b.part === part).reduce((a: any, x: any) => (!a || x.v > a.v ? x : a), null);
  const mo = side("motor");
  const ma = side("machine");
  if (abnormal && mo && ma) {
    if (mo.v >= 1.5 * ma.v) H("H8", `Gối lớn nhất phía động cơ ${mo.b.label} ${fmtN(mo.v)} mm/s, gấp ${fmtN(mo.v / ma.v, 1)} lần phía bơm/quạt (${ma.b.label} ${fmtN(ma.v)}) — năng lượng rung tập trung ở động cơ (quy ước ≥ 1,5 lần).`, 2);
    else if (ma.v >= 1.5 * mo.v) H("H9", `Gối lớn nhất phía bơm/quạt ${ma.b.label} ${fmtN(ma.v)} mm/s, gấp ${fmtN(ma.v / mo.v, 1)} lần phía động cơ (${mo.b.label} ${fmtN(mo.v)}) — năng lượng rung tập trung ở máy công tác (quy ước ≥ 1,5 lần).`, 2);
  }
  const worstB: BearingDef | undefined = res.worst?.b;
  if (!worstB) return;
  const ser = series(worstB);
  const coSo = Number.isFinite(res.worst.coSo) ? res.worst.coSo : null;
  const last = ser.slice(-8);
  if (last.length >= 5 && day(last.at(-1).date) - day(last[0].date) >= 21) {
    const pts = last.map((p: any) => ({ t: day(p.date), v: p.v }));
    const f = linFit(pts);
    const t0 = pts[0].t, t1 = pts.at(-1)!.t;
    const v0 = f.k * t0 + f.b, v1 = f.k * t1 + f.b, rise = v1 - v0;
    if (f.k > 0 && f.r2 >= 0.6 && rise >= Math.max(0.2 * v0, coSo ? 0.25 * coSo : 0)) {
      const ev = res.worst.evals.find((e: any) => e.ev.role === "chính" && e.rg && Object.keys(e.rg).length);
      const ac = alertOf(d);
      const rgUse = ev ? ev.rg : { "cảnh báo của thiết bị": ac.vibration, "nguy hiểm của thiết bị": ac.vibrationDanger };
      const lims = Object.entries<any>(rgUse).filter(([, L]) => Number.isFinite(L) && L > v1).sort((a, b) => a[1] - b[1]);
      let fc = "";
      if (lims.length) {
        const [name, L] = lims[0];
        const days = (L - v1) / f.k;
        const date = new Date((t1 + days) * 864e5).toISOString().slice(0, 10);
        res.forecast = { b: worstB, name: rgName(name), L, days: Math.round(days), date };
        fc = ` Nếu giữ tốc độ này sẽ chạm ranh giới «${rgName(name)}» ${fmtN(L, 2)} mm/s sau khoảng ${Math.round(days)} ngày (≈ ${date}) — dự báo tuyến tính, chỉ để lập kế hoạch.`;
      }
      H("H10", `${worstB.label}: ${last.length} lần đo ${last[0].date} → ${last.at(-1).date} tăng đều ${fmtN(f.k * 30, 2)} mm/s mỗi 30 ngày (R² ${fmtN(f.r2, 2)}), từ ≈ ${fmtN(v0, 2)} lên ≈ ${fmtN(v1, 2)} mm/s.${fc}`, 3);
    }
  }
  const big = coSo ? 0.25 * coSo : 0.5;
  if (last.length >= 6) {
    const dv = last.slice(1).map((p: any, i: number) => p.v - last[i].v).filter((x: number) => Math.abs(x) >= big);
    let turns = 0;
    for (let i = 1; i < dv.length; i++) if (Math.sign(dv[i]) !== Math.sign(dv[i - 1])) turns++;
    const f = linFit(last.map((p: any) => ({ t: day(p.date), v: p.v })));
    if (turns >= 3 && f.r2 < 0.3) H("H11", `${worstB.label}: ${last.length} lần đo gần nhất ${last.map((p: any) => fmtN(p.v)).join(" · ")} mm/s — lên xuống ${turns + 1} lần với bước ≥ ${fmtN(big, 2)} mm/s, không có xu hướng rõ.${bs.some((x: any) => x.rebound) ? " Lần này là lần “hồi lại” sau một số đo thấp bất thường, không tính là tăng đột bậc." : ""}`, 2);
  }
  const by: Record<string, number[]> = {};
  for (const p of ser.slice(-12)) if (p.person) (by[p.person] = by[p.person] || []).push(p.v);
  const grp = Object.entries(by).filter(([, v]) => v.length >= 2).map(([n, v]) => ({ n, m: v.reduce((a, b) => a + b, 0) / v.length, c: v.length }));
  if (grp.length >= 2) {
    grp.sort((a, b) => a.m - b.m);
    const lo = grp[0], hi = grp.at(-1)!;
    if (lo.m > 0 && hi.m >= 1.3 * lo.m && hi.m - lo.m >= big) H("H12", `${worstB.label}: trung bình theo người đo — ${grp.map((g) => `${g.n} ${fmtN(g.m, 2)} (${g.c} lần)`).join("; ")} mm/s; chênh ${fmtN(hi.m / lo.m, 1)} lần giữa người đo trong cùng giai đoạn.`, 2);
  }
  const unb = (qq: any) => qq.amps.length === 3 && (() => { const m = (qq.amps[0] + qq.amps[1] + qq.amps[2]) / 3; return m > 0 && qq.amps.some((a: number) => Math.abs(a - m) > 0.1 * m); })();
  const lastQ = [...runs.slice(-2).map((p: any) => p.q), q];
  if (lastQ.length === 3 && lastQ.every(unb)) H("H13", `3 lần đo liên tiếp đều lệch dòng 3 pha > 10 % (lần này ${q.amps.map((a: number) => fmtN(a, 0)).join(" / ")} A) — lệch lặp lại nên ít khả năng do nhập nhầm một pha.`, 2);
  const hotOnly = bs.filter((x: any) => (x.tRise || (x.tLevel && x.tLevel !== "normal")) && !x.step && !(x.crit?.dang_ke && x.crit.delta > 0));
  if (hotOnly.length && !res.hyps.some((h: any) => h.id === "H5")) H("H14", hotOnly.map((x: any) => `${x.b.label}: ${fmtN(x.t, 0)} °C${x.tBase != null ? " (nền " + fmtN(x.tBase, 0) + " °C)" : ""}`).join("; ") + " — nhiệt cao / tăng trong khi rung cùng gối không tăng đáng kể.", 2);
  const prevVals = ser.slice(0, -2).slice(-5).map((p: any) => p.v);
  const recent = ser.slice(-2).map((p: any) => p.v);
  if (!d.analysis?.baselineFrom && prevVals.length >= 4 && recent.length === 2 && recent.every((v: number) => v <= 0.6 * (median(prevVals) as number))) res.levelDrop = { b: worstB, from: median(prevVals), to: recent };
  void s;
}

// ---------- AG: yêu cầu đo thêm (đặc tả 8) ----------
// vibration-analysis.js:needs
function needs(res: any, now: number = Date.now()) {
  const m = res.plan.machine;
  const n: string[] = res.needs;
  if (LEVELS[res.level as Level].rank >= 2) n.push("Máy có vừa sửa chữa / bảo dưỡng gì gần đây? (sai sót khi lắp lại là nguyên nhân hỏng phổ biến nhất) [WOWK tr.10]");
  if (res.plan.missing.length) n.push("Khai báo " + res.plan.missing.join(", ") + " ở Cấu hình vùng đo › Thông số máy — để chọn đúng tiêu chuẩn (HD mục 3).");
  if (m.meterValue === "peak") n.push("Máy đo hiển thị PEAK: ngưỡng ISO tính theo RMS — số peak cao hơn RMS khoảng 41 % (một tần số), cần quy đổi hoặc đặt máy đo ở chế độ RMS (R1 Phụ lục A).");
  else if (!m.meterValue || m.meterValue === "chua_ro") n.push("Xác nhận máy đo hiển thị vận tốc RMS (không phải peak) và dải tần 10–1000 Hz (R1 §4.3, Phụ lục A).");
  {
    const nn = m.speedMaxRpm || m.speedRpm;
    if (m.freqLowHz && ((nn && nn <= 600 && m.freqLowHz > 2) || m.freqLowHz > 10)) n.push(`Cận dưới dải tần máy đo ${m.freqLowHz} Hz chưa đạt R1 §4.3 (cần ≤ ${nn && nn <= 600 ? 2 : 10} Hz) — số tổng có thể bị thấp hơn thực tế.`);
  }
  if (!m.speedRpm) n.push("Tốc độ quay từ nhãn máy — để tính 1X, phát hiện đảo cột và lẫn µm/mm (HD mục 5).");
  if (res.plan.foundations.length > 1) n.push("Kiểu bệ cứng / mềm — đo rung chân máy so với gối đỡ: < 25 % là cứng (HD mục 9.1).");
  if (!m.xAxis || m.xAxis === "chua_ro") n.push("Quy ước phương X là ngang hay đứng (HD mục 3.3).");
  if (res.plan.main && !res.plan.confirmed) n.push("PXVH1 xác nhận tiêu chuẩn chính (hiện là gợi ý).");
  if (res.unconfirmed) n.push("Đo lại xác nhận trong 24–48 giờ — không kết luận xấu từ một lần đo [WOWK tr.5].");
  if (LEVELS[res.level as Level].rank >= 2) n.push("Đo phổ vận tốc, phổ bao hình gE, pha 1X và rung dọc trục — số tổng không đủ để xác định nguyên nhân [WOWK tr.4].");
  if (!res.q.amps.length) n.push("Ghi dòng điện lúc đo — để so điều kiện vận hành (tiêu chí II kém tin cậy khi thiếu, R1 §4.5).");
  {
    const age = Math.round((now - Date.parse(res.r.date + "T00:00:00Z")) / 864e5);
    if (age > 21) n.push(`Lần đo có số liệu gần nhất là ${res.r.date} (${age} ngày trước) — các tuần sau để trống; kết luận có thể đã cũ, cần đo lại.`);
  }
  if (res.levelDrop) n.push(`${res.levelDrop.b.label}: rung giảm hẳn từ ≈ ${fmtN(res.levelDrop.from, 2)} xuống ${res.levelDrop.to.map((v: number) => fmtN(v)).join(" · ")} mm/s ở 2 lần đo gần nhất — nếu máy vừa sửa chữa / bảo dưỡng, đặt “mức nền từ ngày” bên dưới để so với tình trạng mới (R1 §6.2.3).`);
  if (!(res.r || {}).person) n.push("Ghi tên người đo — thiếu người đo thì lần đo không dùng làm mức nền và không phân tích được sai khác giữa người đo (Q8).");
}

// ---------- Kế hoạch xử lý theo dữ liệu: thứ tự bước + thời hạn ----------
// vibration-analysis.js:actionPlan
export function actionPlan(res: any): [string, string, string][] {
  const lv: Level = res.level;
  if (lv === "na") return [];
  const steps: [string, string, string][] = [];
  const top = res.hyps.filter((h: any) => h.id !== "H0");
  const acts = ([...new Set(top.flatMap((h: any) => h.acts))] as string[]).filter((k) => CAUSE_ACTIONS[k]);
  const fc = res.forecast ? ` (xu hướng dự báo chạm «${res.forecast.name}» ≈ ${res.forecast.date})` : "";
  if (res.hyps.some((h: any) => ["H0", "H11", "H12"].includes(h.id)) || res.unconfirmed || res.bearings.some((x: any) => x.rebound)) steps.push(["Xác minh số liệu trước khi can thiệp", "Đo lại ngay cùng điểm, cùng phương, cùng máy đo (tốt nhất người khác đo); đối chiếu cờ chất lượng số liệu.", lv === "normal" || lv === "watch" ? "Trong 3 ngày" : "Trong ca"]);
  steps.push(["Kiểm tra nhanh không cần dừng máy", "Nhiệt và tiếng ồn gối, bôi trơn, bu-lông chân / nắp ổ, dòng điện 3 pha, chế độ vận hành (lưu lượng, van, cửa gió).", ({ stop: "Ngay lập tức", soon: "Trong ca", plan: "Trong 3 ngày", watch: "Trong 7 ngày", normal: "Theo chu kỳ đo định kỳ" } as any)[lv]]);
  const meas = [...new Set(top.map((h: any) => h.check))].slice(0, 2) as string[];
  if (LEVELS[lv].rank >= 2) steps.push(["Đo bổ sung để phân biệt nguyên nhân", meas.length ? meas.join(" · ") : "Đo phổ vận tốc, gE, pha 1X và rung dọc trục.", lv === "watch" ? "Trong 7 ngày" : "Trước khi sửa"]);
  for (const k of acts.slice(0, 2)) {
    const a = CAUSE_ACTIONS[k];
    steps.push([`Xử lý nếu xác nhận: ${a[0]}`, `Tạm thời: ${a[1]} — Triệt để: ${a[2]}`, LEVELS[lv].rank >= 3 ? DEADLINE[lv] + fc : "Khi đã xác nhận nguyên nhân" + fc]);
  }
  if (LEVELS[lv].rank >= 2) steps.push(["Nghiệm thu sau xử lý", acts.length ? acts.slice(0, 2).map((k) => CAUSE_ACTIONS[k][3]).join(" ") : "Rung về mức nền; sau sửa chữa ≤ 1,25 × A/B (R1 §6.2.3).", "Ngay sau khi chạy lại"]);
  return steps;
}

// vibration-analysis.js:latestResult
export function latestResult(d: AnalysisDevice, settings?: Partial<AnalysisSettings> | null) {
  const recs = datedRecords(d);
  const r = recs.at(-1);
  return r ? analyzeRecord(d, r, { history: recs, settings }) : null;
}

// ---------- Chất lượng số liệu theo tuần / người nhập ----------
// vibration-analysis.js:qualityView (phần tính; UI dựng ở component)
export const QUALITY_QS = ["Q1", "Q4", "Q5", "Q6", "Q10"] as const;
export interface QualityBucket { bad: number; total: number; recs: number; per: Record<string, number> }
export function qualityStats(devices: AnalysisDevice[], isoWeekFn: (s: string) => string) {
  const byWeek: Record<string, QualityBucket> = {};
  const byPerson: Record<string, QualityBucket> = {};
  const add = (o: Record<string, QualityBucket>, k: string, bad: number, total: number, per: Record<string, number>) => {
    o[k] ??= { bad: 0, total: 0, recs: 0, per: {} };
    o[k].bad += bad; o[k].total += total; o[k].recs++;
    for (const q of QUALITY_QS) o[k].per[q] = (o[k].per[q] || 0) + (per[q] || 0);
  };
  for (const d of devices) {
    const recs = datedRecords(d);
    recs.forEach((r, i) => {
      const q = qualityCheck(d, r, recs[i - 1], d.machine?.speedRpm ? d.machine.speedRpm / 60 : null);
      if (q.stopped) return;
      const total = q.read.filter((v: any) => v != null).length + (r.values || []).filter((v) => readCell(v).flag === "can_xac_nhan").length;
      if (!total) return;
      const fl = q.flags.filter((f: any) => f.idx != null && (QUALITY_QS as readonly string[]).includes(f.q));
      const bad = new Set(fl.map((f: any) => f.idx)).size;
      const per: Record<string, number> = {};
      fl.forEach((f: any) => (per[f.q] = (per[f.q] || 0) + 1));
      add(byWeek, isoWeekFn(r.date!), bad, total, per);
      add(byPerson, r.person || "(không ghi người đo)", bad, total, per);
    });
  }
  return { byWeek, byPerson };
}

export { isNum, machineOf };
