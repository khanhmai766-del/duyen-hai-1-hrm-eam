/* eslint-disable @typescript-eslint/no-explicit-any */
// Trạng thái hàng tuần của một bản ghi (chip "Bình thường / Cảnh báo / Nguy hiểm"). Port từ vibracontrol/app.js:
// readingMax, statusFor, recordAssessment, latest. ISO / Wowk / ngưỡng riêng của thiết bị qua vibrationLimitFor.
import { cellNum, isNum, maximum } from "./cell";
import { alertOf, standardPlan, vibrationLimitFor } from "./engine";
import { hasReading } from "./util";
import type { AnalysisDevice, AnalysisRecord } from "./types";

// app.js:VIB_IDX / TEMP_IDX
export const VIB_IDX = [3, 5, 8, 10, 13, 15, 18, 20];
export const TEMP_IDX = [7, 12, 17, 22];

// app.js:readingMax — max vận tốc 2 phương hướng kính mọi gối; ô Excel đi qua readCell.
export function readingMax(values: unknown[] | null | undefined, extra?: Record<string, unknown> | null) {
  const v = values || [];
  const e = Object.entries(extra || {});
  const nums = [...v.map(cellNum), ...e.map(([, x]) => cellNum(x))].filter(isNum);
  const amps = [0, 1, 2].map((i) => cellNum(v[i])).filter(isNum);
  return {
    stopped: nums.length > 0 && (nums.every((x) => x === 0) || (amps.length > 0 && amps.every((x) => x === 0))),
    a: maximum([...VIB_IDX.map((i) => cellNum(v[i])), ...e.filter(([k]) => k.endsWith("(mm/s)")).map(([, x]) => cellNum(x))]),
    t: maximum([...TEMP_IDX.map((i) => cellNum(v[i])), ...e.filter(([k]) => k.endsWith("(°C)")).map(([, x]) => cellNum(x))]),
  };
}

export type WeeklyStatus = "Tắt cảnh báo" | "Máy dừng" | "Nguy hiểm" | "Cảnh báo" | "Chưa có số đo" | "Trong ngưỡng";

// app.js:statusFor
export function statusFor(d: Pick<AnalysisDevice, "machine" | "alertConfig">, a: number | null, t: number | null, stopped = false, values: unknown[] | null = null): WeeklyStatus {
  const cfg = alertOf(d);
  if (!cfg.enabled) return "Tắt cảnh báo";
  if (stopped) return "Máy dừng";
  let vibSeen = false, vibWarn = false, vibDanger = false;
  if (Array.isArray(values)) {
    const plan = standardPlan(d);
    for (const [part, x, y] of [["motor", 3, 5], ["motor", 8, 10], ["machine", 13, 15], ["machine", 18, 20]] as [string, number, number][]) {
      for (const [dir, i] of [["X", x], ["Y", y]] as ["X" | "Y", number][]) {
        const v = cellNum(values[i]);
        if (!isNum(v)) continue;
        const limit = vibrationLimitFor(d, part, dir, plan);
        vibSeen = true;
        // ISO: giá trị đúng bằng ranh giới vẫn thuộc vùng thấp hơn. Ngưỡng nội bộ giữ quy tắc >=.
        if (limit.iso ? v > (limit.danger as number) : v >= (limit.danger as number)) vibDanger = true;
        else if (limit.iso ? v > (limit.warn as number) : v >= (limit.warn as number)) vibWarn = true;
      }
    }
  }
  if (!vibSeen && a !== null) { vibDanger = a >= cfg.vibrationDanger; vibWarn = a >= cfg.vibration; }
  return vibDanger || (t !== null && t >= cfg.temperatureDanger) ? "Nguy hiểm" : vibWarn || (t !== null && t >= cfg.temperature) ? "Cảnh báo" : a === null && t === null ? "Chưa có số đo" : "Trong ngưỡng";
}

// app.js:recordAssessment
export function recordAssessment(d: AnalysisDevice, r: AnalysisRecord): WeeklyStatus {
  const { a, t, stopped } = readingMax(r.values, r.extra);
  return statusFor(d, a, t, stopped, r.values);
}

// app.js:latest — lần đo có số gần nhất.
export const latestReading = (d: AnalysisDevice): AnalysisRecord | undefined =>
  d.records.filter((r) => r.date && hasReading(r)).sort((a, b) => a.date!.localeCompare(b.date!) || (a.measureTime || "").localeCompare(b.measureTime || "") || (a.savedAt || "").localeCompare(b.savedAt || "")).at(-1);
