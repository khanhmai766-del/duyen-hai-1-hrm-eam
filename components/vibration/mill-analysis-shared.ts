import { millNum, millPoints, millStopped, rangeDays } from "@/lib/vibration/analysis";
import type { AnalysisRecord } from "@/lib/vibration/analysis";

/** Màu 3 phương X/Y/Z (mill-analysis.js: AXC) và 6 gối (biểu đồ chung). */
export const AXIS_COLOR: Record<string, string> = { X: "#087e8b", Y: "#3979c3", Z: "#b5651d" };
export const BEARING_COLORS = ["#087e8b", "#3979c3", "#9a6f12", "#a95991", "#bc5540", "#6c7c46"];
export const ZONE_LINE_COLORS = ["#379478", "#c08a00", "#c63c46"];
export const ZONE_LINE_KEYS = ["A/B", "B/C", "C/D"];

export type MillMetric = "v" | "d" | "t";
export const metricUnit = (m: string) => (m === "v" ? "mm/s" : m === "d" ? "µm" : "°C");
export const axisLabel = (a: string) => (a === "max" ? "Max X/Y/Z" : a);
/** Số làm tròn 2 chữ số (mill-analysis.js: fmt). */
export const fmt2 = (v: number | null | undefined) => (v == null ? "—" : String(Math.round(v * 100) / 100));
export const bearingRole = (i: number) => (i < 2 ? "Động cơ" : i < 4 ? "Hộp giảm tốc" : "Trục bánh răng nhỏ");

/** Thông số lọc dùng chung cho các khối của trang. */
export interface MillCtx { day: string; from: string; to: string; metric: MillMetric; axis: string; rms: boolean; unit: string }

export interface TrendLine { key: string; name: string; color: string; bearing: number; metric: string; axis: string; dash?: string }
export interface TrendRow { x: number; [k: string]: number | null }

const dayTs = (d: string) => Date.parse(d + "T00:00:00Z");
/** Mốc x (ms) của một lần đo = ngày + giờ đo (nếu có). */
export function recordTs(r: AnalysisRecord): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(r.measureTime || "");
  return dayTs(r.date as string) + (m ? (+m[1] * 60 + +m[2]) * 60000 : 0);
}
/** Mỗi lần đo hợp lệ (không phải máy ngừng) một hàng; mỗi đường một cột — gộp để Tooltip hiện đủ các đường cùng lúc. */
export function trendRows(rs: AnalysisRecord[], lines: TrendLine[]): TrendRow[] {
  const rows: TrendRow[] = [];
  for (const r of rs) {
    if (millStopped(r)) continue;
    const row: TrendRow = { x: recordTs(r) };
    let any = false;
    for (const l of lines) {
      const p = millPoints([r], l.bearing, l.metric, l.axis)[0];
      row[l.key] = p ? p.value : null;
      if (p) any = true;
    }
    if (any) rows.push(row);
  }
  return rows.sort((a, b) => a.x - b.x);
}
/** Trục x theo ngày: khoảng, vạch ngày (thưa dần khi dài) cho recharts. */
export function dayAxis(from: string, to: string) {
  const days = rangeDays(from, to);
  const step = Math.max(1, Math.ceil(days.length / 8));
  return { domain: [dayTs(from), dayTs(to) + 86400000 - 1] as [number, number], ticks: days.filter((_, i) => i % step === 0).map(dayTs), count: days.length };
}
export const tsLabel = (x: number) => {
  const d = new Date(x);
  const s = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return d.getUTCHours() || d.getUTCMinutes() ? `${s} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` : s;
};

/** Tóm tắt lần đo gần nhất theo từng phương (mill-analysis.js: xyzLast). */
export function xyzLast(rs: AnalysisRecord[], bearing: number, metric: string) {
  const last = [...rs].filter((r) => !millStopped(r) && ["X", "Y", "Z"].some((a) => millNum((r.millData as Record<string, unknown>)[`b${bearing}${metric}${a}`]) !== null)).at(-1);
  if (!last) return [];
  return ["X", "Y", "Z"].map((a) => ({ a, v: millNum((last.millData as Record<string, unknown>)[`b${bearing}${metric}${a}`]) }));
}
