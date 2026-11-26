import {
  MILL_AREA_RE, MILL_LETTER_SHIFT, MILL_NAME_RE, MNK_AREA, MNK_SHIFT_NAMES, SHIFT_IDS, TBNT_AREA,
  DEFAULT_MEASURE_GROUP, type ShiftId,
} from "./constants";
import type { DeviceKind } from "./types";

const norm = (s: string) => String(s || "").normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");

const MNK_BY_NAME = new Map<string, ShiftId>(
  SHIFT_IDS.flatMap((shift) => MNK_SHIFT_NAMES[shift].map((name) => [norm(name), shift] as const))
);

export function mnkShiftOf(area: string, name: string): ShiftId | null {
  return area === MNK_AREA ? MNK_BY_NAME.get(norm(name)) ?? null : null;
}

export function millShiftOf(area: string, name: string, active: boolean): ShiftId | null {
  if (!active || !MILL_AREA_RE.test(area)) return null;
  const m = MILL_NAME_RE.exec(name.trim());
  return m ? MILL_LETTER_SHIFT[m[2].toUpperCase()] : null;
}

/** Phân loại theo quy tắc spec: 14 MNK, 12 máy nghiền đang hoạt động, bơm nước thô, còn lại Theo kỳ. */
export function classifyDevice(d: { area: string; name: string; active: boolean }): { kind: DeviceKind; shift: ShiftId | null } {
  const mnk = mnkShiftOf(d.area, d.name);
  if (mnk) return { kind: "MNK", shift: mnk };
  const mill = millShiftOf(d.area, d.name, d.active);
  if (mill) return { kind: "MILL", shift: mill };
  if (d.active && d.area === TBNT_AREA) return { kind: "TBNT", shift: null };
  return { kind: "WEEKLY", shift: null };
}

/** Thiết bị xuất hiện ở màn Theo kỳ: đang hoạt động, trừ 14 động cơ MNK. */
export function inWeekly(d: { area: string; name: string; active: boolean }) {
  return d.active && !mnkShiftOf(d.area, d.name);
}

export function groupsOf(measureGroups: string[]) {
  return measureGroups.length ? measureGroups : [DEFAULT_MEASURE_GROUP];
}

/** Tổ máy suy từ tên khu vực: S1 / S2 / null (dùng chung hoặc không rõ). */
export function unitOfArea(area: string): "S1" | "S2" | null {
  const m = /\bS([12])\b/i.exec(area);
  return m ? (`S${m[1]}` as "S1" | "S2") : null;
}
