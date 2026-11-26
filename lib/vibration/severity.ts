import {
  AMPLITUDE_IDX, DEFAULT_ALERT, MILL_DISPLACEMENT_LIMIT, MILL_VELOCITY_LIMIT, RISE_RATIO, TEMP_IDX, VELOCITY_IDX,
} from "./constants";
import { cellNumber } from "./parse";
import type { AlertConfig } from "./types";

export type VibStatus = "empty" | "ok" | "warn" | "danger" | "stopped" | "off";

export interface Reading {
  numbers: number[];
  stopped: boolean;
  maxVelocity: number | null;
  maxTemp: number | null;
}

/** Số lớn nhất của vận tốc (mm/s) và nhiệt độ (°C); "máy dừng" = mọi số đều 0 hoặc 3 pha dòng điện đều 0. */
export function readingMax(values: unknown[]): Reading {
  const cells = values.map(cellNumber);
  const numbers = cells.filter((n): n is number => n !== null);
  const current = cells.slice(0, 3).filter((n): n is number => n !== null);
  const stopped = numbers.length > 0 && (numbers.every((n) => n === 0) || (current.length > 0 && current.every((n) => n === 0)));
  const max = (idx: readonly number[]) => {
    const list = idx.map((i) => cells[i]).filter((n): n is number => n != null);
    return list.length ? Math.max(...list) : null;
  };
  return { numbers, stopped, maxVelocity: max(VELOCITY_IDX), maxTemp: max(TEMP_IDX) };
}

/** Mức cảnh báo theo ngưỡng của thiết bị (alertConfig), mặc định 4.5/7.1 mm/s và 70/85 °C (bản đơn giản v1). */
export function statusFor(alert: Partial<AlertConfig> | null | undefined, values: unknown[]): VibStatus {
  const cfg = { ...DEFAULT_ALERT, ...(alert ?? {}) };
  if (cfg.enabled === false) return "off";
  const r = readingMax(values);
  if (r.numbers.length === 0) return "empty";
  if (r.stopped) return "stopped";
  if ((r.maxVelocity ?? -1) >= cfg.vibrationDanger || (r.maxTemp ?? -1) >= cfg.temperatureDanger) return "danger";
  if ((r.maxVelocity ?? -1) >= cfg.vibration || (r.maxTemp ?? -1) >= cfg.temperature) return "warn";
  return "ok";
}

export const STATUS_LABEL: Record<VibStatus, string> = {
  empty: "Chưa nhập", ok: "Bình thường", warn: "Cảnh báo", danger: "Nguy hiểm", stopped: "Máy dừng", off: "Tắt cảnh báo",
};

export type CellLevel = "normal" | "rise" | "over";

/** Mill/TBNT: đỏ (over) khi vận tốc > 5 mm/s hoặc biên độ > 50 µm; vàng (rise) khi ≥ 125 % cùng ô ở lần đo trước. */
export function fixedCellLevel(
  idxKind: "velocity" | "amplitude" | "temperature",
  value: number | null,
  previous: number | null
): CellLevel {
  if (value == null) return "normal";
  if (idxKind === "velocity" && value > MILL_VELOCITY_LIMIT) return "over";
  if (idxKind === "amplitude" && value > MILL_DISPLACEMENT_LIMIT) return "over";
  if (previous != null && previous > 0 && value >= previous * RISE_RATIO) return "rise";
  return "normal";
}

/** Kiểu cột của chỉ số trong mảng 23 giá trị (cho fixedCellLevel). */
export function valueIndexKind(i: number): "velocity" | "amplitude" | "temperature" | "current" {
  if ((VELOCITY_IDX as readonly number[]).includes(i)) return "velocity";
  if ((AMPLITUDE_IDX as readonly number[]).includes(i)) return "amplitude";
  if ((TEMP_IDX as readonly number[]).includes(i)) return "temperature";
  return "current";
}

/** % thay đổi vận tốc lớn nhất so với lần trước; null nếu thiếu số liệu. */
export function riseVsPrevious(current: number | null, previous: number | null) {
  return current != null && previous != null && previous > 0 ? ((current - previous) / previous) * 100 : null;
}

/** Vận tốc/nhiệt độ lớn nhất trong millData (b1vX…b6vZ mm/s; b1t…b6t, gearSmall, gearRing °C). */
export function millMax(millData: Record<string, unknown> | null | undefined) {
  let maxVelocity: number | null = null;
  let maxTemp: number | null = null;
  for (const [key, raw] of Object.entries(millData ?? {})) {
    const n = cellNumber(raw);
    if (n === null) continue;
    if (/^b[1-6]v[XYZ]$/.test(key)) maxVelocity = Math.max(maxVelocity ?? 0, n);
    else if (/^b[1-6]t$/.test(key) || key === "gearSmall" || key === "gearRing") maxTemp = Math.max(maxTemp ?? 0, n);
  }
  return { maxVelocity, maxTemp };
}
