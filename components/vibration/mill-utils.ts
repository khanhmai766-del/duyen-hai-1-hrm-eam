"use client";

import * as React from "react";
import { cellNumber, parseCell } from "@/lib/vibration/parse";
import type { VibrationRecordDto } from "@/lib/vibration/types";

export const MILL_BEARINGS = [1, 2, 3, 4, 5, 6] as const;
export const MILL_AXES = ["X", "Y", "Z"] as const;
/** 44 ô nhập tay (6 gối x (3 vận tốc + 3 biên độ + nhiệt độ) + 2 bánh răng); dầu VRL nhập ở tab riêng. */
export const MILL_KEYS: string[] = [
  ...MILL_BEARINGS.flatMap((n) => [...MILL_AXES.flatMap((a) => [`b${n}v${a}`, `b${n}d${a}`]), `b${n}t`]),
  "gearSmall",
  "gearRing",
];
export const OIL_LOW = 1.5;
export const OIL_HIGH = 3;
export const MILL_FIELD_TOTAL = MILL_KEYS.length + 1; // + oil

export function keyKind(key: string): "velocity" | "amplitude" | "temperature" {
  if (/^b\dv/.test(key)) return "velocity";
  if (/^b\dd/.test(key)) return "amplitude";
  return "temperature";
}

export function keyWhere(key: string) {
  const m = /^b(\d)([vdt])([XYZ]?)$/.exec(key);
  if (m) return `Gối #${m[1]}${m[3] ? ` ${m[3]}` : ""}`;
  return key === "gearSmall" ? "Bánh răng nhỏ" : key === "gearRing" ? "Vành răng lớn" : key;
}

export const fmtNum = (n: number | null | undefined, digits = 1) =>
  n == null ? "—" : String(Number(n.toFixed(digits)));

export const dmy = (d: string) => d.split("-").reverse().join("/");

/** Giờ Việt Nam HH:mm của một thời điểm ISO. */
export function vnClock(iso: string) {
  return new Date(iso).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Thông báo khi ô Mill không phải số (đúng chữ của bản cũ). */
export const MILL_NUM_ERROR = "Chỉ nhập số không âm, dùng dấu chấm thập phân (14.6), không dùng dấu phẩy.";

/** Số kiểu Việt Nam (dấu phẩy thập phân) như bản cũ. */
export const fmtVi = (n: number | null | undefined, dp = 2) => (n == null ? "—" : Number(n.toFixed(dp)).toLocaleString("vi-VN", { maximumFractionDigits: dp }));

/** Tên ô để báo lỗi khi lưu ("Gối #1 vận tốc X"). */
export function fieldName(k: string) {
  const m = /^b(\d)([vd])([XYZ])$/.exec(k);
  if (m) return `Gối #${m[1]} ${m[2] === "v" ? "vận tốc" : "biên độ"} ${m[3]}`;
  const t = /^b(\d)t$/.exec(k);
  if (t) return `Gối #${t[1]} nhiệt độ`;
  return ({ gearSmall: "Bánh răng nhỏ", gearRing: "Vành răng lớn", oil: "Dầu tiêu hao", time: "Giờ đo" } as Record<string, string>)[k] ?? k;
}

export interface MillRow {
  time: string;
  note: string;
  v: Record<string, string>;
}
export interface MillEdit {
  time?: string;
  note?: string;
  v?: Record<string, string>;
}

const str = (x: unknown) => {
  const n = cellNumber(x);
  return n == null ? "" : String(n);
};

export function savedRow(rec: VibrationRecordDto | undefined): MillRow {
  const md = rec?.millData ?? {};
  return {
    time: rec?.measureTime ?? "",
    note: rec?.note ?? "",
    v: Object.fromEntries([...MILL_KEYS, "oil"].map((k) => [k, str(md[k])])),
  };
}

export function mergeRow(saved: MillRow, edit: MillEdit | undefined): MillRow {
  if (!edit) return saved;
  return { time: edit.time ?? saved.time, note: edit.note ?? saved.note, v: { ...saved.v, ...(edit.v ?? {}) } };
}

export const rowHasData = (row: MillRow) => MILL_KEYS.some((k) => row.v[k] !== "") || row.note.trim() !== "";
export const filledCount = (row: MillRow, withOil = true) =>
  [...MILL_KEYS, ...(withOil ? ["oil"] : [])].filter((k) => row.v[k] !== "").length;

/** Chuyển các ô chữ thành số; trả lỗi tiếng Việt khi sai định dạng. */
export function buildMillData(row: MillRow): { data: Record<string, number | null>; error?: string } {
  const data: Record<string, number | null> = {};
  for (const k of MILL_KEYS) {
    const n = parseCell(row.v[k]);
    if (n === undefined) return { data, error: `${keyWhere(k)} (${k}): chỉ nhập số không âm, dùng dấu chấm thập phân` };
    data[k] = n;
  }
  return { data };
}

export const draftKey = (date: string, shift: string, deviceId: string) => `${date}|${shift}|${deviceId}`;

/** Bản nháp lưu localStorage (mất kết nối/đóng tab vẫn còn). */
export function useDrafts<T>(storageKey: string) {
  const [drafts, setState] = React.useState<Record<string, T>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return (JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, T>) ?? {};
    } catch {
      return {};
    }
  });
  const update = React.useCallback(
    (fn: (prev: Record<string, T>) => Record<string, T>) => {
      setState((prev) => {
        const next = fn(prev);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* bỏ qua */
        }
        return next;
      });
    },
    [storageKey]
  );
  return [drafts, update] as const;
}
