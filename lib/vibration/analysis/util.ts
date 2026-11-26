/* eslint-disable @typescript-eslint/no-explicit-any */
// Tiện ích dùng chung của bộ phân tích rung (port từ vibration-analysis.js).
import { isNum } from "./cell";
import type { AnalysisRecord } from "./types";

// vibration-analysis.js:fmtN
export const fmtN = (v: number | null | undefined, dp = 1): string =>
  v == null || !Number.isFinite(v) ? "—" : Number(v.toFixed(dp)).toLocaleString("vi-VN", { maximumFractionDigits: dp });
// vibration-analysis.js:median
export const median = (xs: number[]): number | null => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null;
};
// vibration-analysis.js:recordOrder
export const recordOrder = (a: AnalysisRecord, b: AnalysisRecord): number =>
  (a.date || "").localeCompare(b.date || "") || (a.measureTime || "").localeCompare(b.measureTime || "") || (a.savedAt || "").localeCompare(b.savedAt || "");
// vibration-analysis.js:linFit
export const linFit = (pts: { t: number; v: number }[]) => {
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.t, 0) / n;
  const my = pts.reduce((a, p) => a + p.v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pts) {
    sxy += (p.t - mx) * (p.v - my);
    sxx += (p.t - mx) ** 2;
    syy += (p.v - my) ** 2;
  }
  const k = sxx ? sxy / sxx : 0;
  return { k, b: my - k * mx, r2: sxx && syy ? (sxy * sxy) / (sxx * syy) : 0 };
};
// vibration-analysis.js:isoWeek
export function isoWeek(s: string): string {
  const d = new Date(s + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const y = d.getUTCFullYear();
  const w = 1 + Math.round(((d as any) - Date.UTC(y, 0, 4)) / 864e5 / 7 - (((new Date(Date.UTC(y, 0, 4)).getUTCDay() + 6) % 7) - 3) / 7);
  return y + "-W" + String(w).padStart(2, "0");
}
// app.js:hasReading — dòng không có số nào KHÔNG phải lần đo.
export const hasReading = (r: { values?: unknown[]; extra?: Record<string, unknown> | null }): boolean =>
  (r.values || []).some((v) => v != null && String(v).trim() !== "") || Object.values(r.extra || {}).some((v) => v != null && String(v).trim() !== "");
export { isNum };
