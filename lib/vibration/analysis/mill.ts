/* eslint-disable @typescript-eslint/no-explicit-any */
// Phân tích độ rung MILL (6 gối) — port từ vibracontrol/mill-analysis.js (window.MillAnalysis) và mill-shift.js (fields, dateValid, unitForArea, shifts, clock).
// Chỉ phần tính toán; giao diện dựng ở components/vibration/mill-analysis-*.tsx.
import { danhGiaIso20816_3, nhomIso20816_3, TC } from "./core";
import { foundationOf } from "./machine";
import type { AnalysisRecord } from "./types";

export type MillBearing = 1 | 2 | 3 | 4 | 5 | 6;
export interface MillDevice { id: string; name: string; area: string; machine?: Record<string, any> | null; records: AnalysisRecord[] }

// mill-shift.js:shifts
export const MILL_SHIFTS = [
  { id: "sang", name: "Ca sáng", hours: "06:00–14:00", letters: ["A", "B"] },
  { id: "chieu", name: "Ca chiều", hours: "14:00–22:00", letters: ["C", "D"] },
  { id: "dem", name: "Ca đêm", hours: "22:00–06:00 hôm sau", letters: ["E", "F"] },
];
// mill-shift.js:fields
export const MILL_FIELD_KEYS: string[] = [
  ...Array.from({ length: 6 }, (_, i) => ["X", "Y", "Z"].flatMap((axis) => [`b${i + 1}v${axis}`, `b${i + 1}d${axis}`]).concat(`b${i + 1}t`)).flat(),
  "gearSmall", "gearRing", "oil",
];
// mill-shift.js:unitForArea / dateValid
export const millUnitForArea = (a: string): string => /^M(?:áy nghiền|ILL) S([12])$/i.exec(String(a))?.[1] || "";
export const millDateValid = (d: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + "T12:00:00Z")) && new Date(d + "T12:00:00Z").toISOString().slice(0, 10) === d;
// Tên máy nghiền hiển thị ở menu phân tích (mill-analysis.js: draw)
export const MILL_NAME_FILTER = /^Máy nghiền [12][A-F]$/i;
// mill-shift.js:clock — ngày/ca theo giờ Việt Nam (ca đêm trước 06:00 thuộc ngày hôm trước).
export function millClock(now = new Date()): { date: string; shift: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]));
  let date = `${p.year}-${p.month}-${p.day}`;
  const h = +p.hour;
  if (h < 6) date = new Date(Date.parse(date + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
  return { date, shift: h >= 6 && h < 14 ? "sang" : h >= 14 && h < 22 ? "chieu" : "dem" };
}

// mill-analysis.js: rpm
export const MILL_RPM = [993, 993, 993, 139, 139, 139];
// mill-analysis.js: num (chỉ nhận số không âm, dấu chấm)
export const millNum = (v: unknown): number | null => (v !== null && v !== undefined && String(v).trim() !== "" && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(v).trim()) && Number.isFinite(+(v as any)) ? +(v as any) : null);
// mill-analysis.js: stopped
export const millStopped = (r: { note?: string }): boolean => /máy dự phòng|ngừng sửa chữa|máy không vận hành|máy ngừng|máy dừng/i.test(r.note || "");
const shiftOf = (r: AnalysisRecord) => (r.shift ?? (r.millData as any)?.shift ?? "") as string;
const isMillRec = (r: AnalysisRecord) => r.kind === "MILL" && !!r.millData;

// mill-analysis.js: records(d, month) — bản ghi mới nhất theo (ngày|ca) trong tháng.
export function millRecords(d: MillDevice, month: string): AnalysisRecord[] {
  const latest = new Map<string, AnalysisRecord>();
  for (const r of d.records || []) {
    if (!isMillRec(r) || !millDateValid(r.date as string) || !(r.date as string).startsWith(month + "-")) continue;
    const k = r.date + "|" + shiftOf(r);
    const old = latest.get(k);
    if (!old || String(r.savedAt || "") >= String(old.savedAt || "")) latest.set(k, r);
  }
  return [...latest.values()].sort((a, b) => (a.date as string).localeCompare(b.date as string) || String(a.measureTime || "").localeCompare(String(b.measureTime || "")));
}
export const addDays = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
export function rangeDays(from: string, to: string): string[] {
  if (!millDateValid(from) || !millDateValid(to) || from > to) return [];
  const count = Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000) + 1;
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}
export const recentRange = (today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)) => ({ from: addDays(today, -29), to: today });
export function rangeRecords(d: MillDevice, from: string, to: string): AnalysisRecord[] {
  if (!rangeDays(from, to).length) return [];
  const months = [...new Set((d.records || []).filter((r) => millDateValid(r.date as string) && (r.date as string) >= from && (r.date as string) <= to).map((r) => (r.date as string).slice(0, 7)))];
  return months.flatMap((m) => millRecords(d, m).filter((r) => (r.date as string) >= from && (r.date as string) <= to)).sort((a, b) => (a.date as string).localeCompare(b.date as string) || String(a.measureTime || "").localeCompare(String(b.measureTime || "")));
}
export interface MillPoint { date: string; time: string; value: number; count: number }
// mill-analysis.js: points
export function millPoints(rs: AnalysisRecord[], b: number, metric: string, axis: string): MillPoint[] {
  return rs.filter((r) => !millStopped(r)).flatMap((r) => {
    const keys = metric === "t" ? [`b${b}t`] : axis === "max" ? ["X", "Y", "Z"].map((a) => `b${b}${metric}${a}`) : [`b${b}${metric}${axis}`];
    const vs = keys.map((k) => millNum((r.millData as any)[k])).filter((v): v is number => v !== null);
    return vs.length ? [{ date: r.date as string, time: r.measureTime || "", value: Math.max(...vs), count: vs.length }] : [];
  });
}
// mill-analysis.js: bearingSeries
export const millBearingSeries = (rs: AnalysisRecord[], metric: string, axis: string) => [1, 2, 3, 4, 5, 6].map((b) => ({ bearing: b, points: millPoints(rs, b, metric, axis) }));
// mill-analysis.js: zone — phân vùng cố định (chỉ dùng tham khảo)
export const millZoneFixed = (v: number | null) => (v == null ? "—" : v <= 2.3 ? "A" : v <= 4.5 ? "B" : v <= 7.1 ? "C" : "D");

export interface MillIso { zone: string; limits: Record<string, number> | null; notes: string[]; conditional: boolean; group?: number | string }
// mill-analysis.js: iso — phân vùng ISO 20816-3 có điều kiện cho gối b
export function millIso(v: number | null, d: MillDevice | null | undefined, b = 1, rms = true): MillIso {
  const m = d?.machine || {};
  const notes: string[] = [];
  if (!rms || v == null) return { zone: "—", limits: null, notes: [!rms ? "Chưa xác nhận RMS" : "Chưa đo"], conditional: true };
  if (!TC.ISO_20816_3_2022) return { zone: "—", limits: null, notes: ["Chưa nạp bảng ISO"], conditional: true };
  const power = millNum(m.powerKw);
  const group: any = power ? nhomIso20816_3(power, millNum(m.shaftHeightMm)) : 1;
  if (power !== null && power <= 15) return { zone: "—", limits: null, notes: ["Công suất ngoài phạm vi ISO 20816-3"], conditional: true };
  if (!power) notes.push("Thiếu công suất: tham chiếu Nhóm 1 theo SCCN, chưa xác nhận nhóm ISO");
  if (!m.type) notes.push("Thiếu loại máy");
  else if (!["may_nghien", "dong_co", "hop_so", "bang_tai", "khac"].includes(m.type)) return { zone: "—", limits: null, notes: ["Loại máy cần kiểm tra tiêu chuẩn riêng trong menu Phân tích độ rung"], conditional: true };
  if (!m.speedRpm) notes.push("Tốc độ từng gối dùng tham chiếu SCCN; cần xác minh thực tế");
  const speed = b <= 3 ? millNum(m.speedRpm) || MILL_RPM[b - 1] : MILL_RPM[b - 1];
  if (speed < 120 || speed > 30000) return { zone: "—", limits: null, notes: ["Tốc độ ngoài phạm vi ISO 20816-3"], conditional: true };
  const foundations = new Set<string>();
  for (const axis of ["X", "Y"] as const) {
    const mm = { ...m, speedRpm: speed, speedMaxRpm: speed };
    const g = foundationOf(mm, axis);
    if (g === "cung" || g === "mem") foundations.add(g);
    else { foundations.add("cung"); foundations.add("mem"); notes.push("Bệ " + axis + " chưa rõ: xét cứng/mềm, lấy khắt khe hơn"); }
  }
  notes.push("Sàng lọc max X/Y/Z; cần xác minh hai hướng kính, vị trí đo và dải đo" + (b >= 4 ? " tần số thấp (1X ≈2.32 Hz)" : ""));
  const results = [...foundations].map((g) => danhGiaIso20816_3(TC.ISO_20816_3_2022, group, g, [v]));
  const worst = results.reduce((a, c) => ("ABCD".indexOf(c.vung) > "ABCD".indexOf(a.vung) ? c : a));
  return { zone: worst.vung, limits: worst.ranh_gioi, group, notes, conditional: true };
}
// mill-analysis.js: dayPair
export function millDayPair(d: MillDevice, day: string, b: number) {
  const months = [...new Set((d.records || []).filter((r) => r.date && r.date <= day).map((r) => (r.date as string).slice(0, 7)))].sort();
  const pp = millPoints(months.flatMap((m) => millRecords(d, m)), b, "v", "max");
  return { last: pp.filter((p) => p.date === day).at(-1), prev: pp.filter((p) => p.date < day).at(-1) };
}
// mill-analysis.js: referencePoint
export function millReferencePoint(d: MillDevice, day: string, b: number, axis = "max") {
  const p = millPoints(millRecords(d, day.slice(0, 7)).filter((r) => r.date === day), b, "v", axis).at(-1);
  return { rpm: MILL_RPM[b - 1], frequency: MILL_RPM[b - 1] / 60, value: p?.value ?? null, time: p?.time || "", date: day, count: p?.count || 0 };
}
// mill-analysis.js: worstBearing
export function millWorstBearing(d: MillDevice, day: string): number {
  let best: { b: number; value: number } | null = null;
  for (let b = 1; b <= 6; b++) {
    const p = millReferencePoint(d, day, b);
    if (p.value !== null && (!best || p.value > best.value)) best = { b, value: p.value };
  }
  return best?.b || 1;
}
export interface MillCause { name: string; check: string; evidence: string }
// mill-analysis.js: assessment — xu hướng, giả thuyết (chưa xác nhận), khuyến cáo cho một gối.
export function millAssessment(d: MillDevice, day: string, b: number, rms: boolean) {
  const { last, prev } = millDayPair(d, day, b);
  const ratio = last && prev && prev.value > 0 ? last.value / prev.value : null;
  const z = millIso(last?.value ?? null, d, b, rms).zone;
  const trend = !last ? "Chưa có số vận tốc (đến ngày chọn)" : !prev ? "Chưa có lần đo trước để so sánh" : prev.value === 0 ? (last.value === 0 ? "Giữ mức 0" : "Tăng từ 0 — không tính %") : (ratio as number) >= 5 ? "Tăng ≥5× so với lần chạy trước" : (ratio as number) >= 2 ? "Tăng ≥2× so với lần chạy trước" : (ratio as number) >= 1.25 ? "Tăng ≥25% so với lần chạy trước" : (ratio as number) < 1 ? "Giảm so với lần chạy trước" : "Chưa tăng ≥25% so với lần chạy trước";
  const attention = !!last && (["C", "D"].includes(z) || (ratio !== null && ratio >= 1.25));
  const causes: MillCause[] = [];
  if (attention) {
    if (b <= 2) causes.push({ name: "Mất cân bằng / lệch tâm / lỏng liên kết động cơ", check: "Đo phổ 1X/2X, pha và kiểm tra chân máy, bu lông, khớp nối; so cùng tải và vị trí.", evidence: "Số tổng tăng/vượt mức sàng lọc ở gối động cơ; chưa có phổ hoặc pha." });
    else if (b <= 4) causes.push({ name: "Ăn khớp bánh răng / bôi trơn / ổ lăn hộp giảm tốc", check: "Kiểm tra dầu, nhiệt và tiếng ồn; đo GMF, dải biên và gia tốc/enveloping để phân biệt.", evidence: "Số tổng tăng/vượt mức sàng lọc tại hộp giảm tốc; chưa có GMF/enveloping." });
    else causes.push({ name: "Ăn khớp bánh răng nhỏ – vành răng / tải / bôi trơn", check: "Kiểm tra tiếp xúc răng, bôi trơn, liên kết và tải; đo GMF/dải biên, đối chiếu lịch sửa chữa.", evidence: "Số tổng tăng/vượt mức sàng lọc ở trục bánh răng nhỏ; chưa có phổ ăn khớp." });
    causes.push({ name: "Thay đổi tải / điều kiện đo hoặc truyền rung từ cụm liên kết", check: "Đo lại cùng điểm/hướng/tải, kiểm tra các gối lân cận và xác nhận máy đang chạy.", evidence: "Bảng ca chưa ghi đầy đủ điều kiện tải và cách đặt cảm biến." });
  }
  const advice = !last ? "Bổ sung số đo X/Y/Z khi máy chạy." : z === "D" ? "Báo người phụ trách, đo kiểm xác nhận sớm và đánh giá biện pháp xử lý theo quy trình vận hành; không tự ra lệnh dừng máy." : z === "C" ? "Theo dõi sát, đo xác minh và lập kế hoạch kiểm tra/khắc phục vào thời điểm phù hợp." : attention ? "Đo lại và tăng theo dõi; so với nền cùng điều kiện, thu thập FFT trước khi kết luận nguyên nhân." : "Tiếp tục theo dõi theo ca và giữ cách đo nhất quán; số tổng chưa chứng minh máy không có lỗi.";
  return { last, prev, ratio, zone: z, trend, causes, advice };
}

/** Bản ghi MILL gần nhất có số (≤ ngày chọn, bỏ máy dự phòng/ngừng) — dùng cho thẻ tổng quan & phân tích (mill-analysis.js: draw). */
export function millLatestRecord(d: MillDevice, day: string): AnalysisRecord | null {
  const months = [...new Set((d.records || []).filter((r) => isMillRec(r) && millDateValid(r.date as string) && (r.date as string) <= day).map((r) => (r.date as string).slice(0, 7)))].sort();
  return months.flatMap((m) => millRecords(d, m)).filter((r) => (r.date as string) <= day && !millStopped(r) && MILL_FIELD_KEYS.some((k) => millNum((r.millData as any)[k]) !== null)).at(-1) || null;
}
