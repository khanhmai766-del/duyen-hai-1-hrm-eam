import { SHIFT_TYPE_ORDER, type ShiftTypeKey } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";
import { vietnamNow } from "@/lib/utils";
import { vietnamDayKey } from "@/lib/vietnam-time";

export const GROUNDING_SHIFT_HOURS: Record<ShiftTypeKey, string> = {
  MORNING: "06:00–14:00", AFTERNOON: "14:00–22:00", NIGHT: "22:00–06:00 hôm sau",
};
export const GROUNDING_SHIFT_HOURS_COMPACT: Record<ShiftTypeKey, string> = {
  MORNING: "06–14h", AFTERNOON: "14–22h", NIGHT: "22–06h",
};
export type GroundingSlot = { date: string; shiftType: ShiftTypeKey };
export type GroundingScheduleItem = {
  id: string; positionCode?: string | null; position?: string | null;
  machine: string; areaEquipment: string;
};

export function isGroundingShift(value: unknown): value is ShiftTypeKey {
  return SHIFT_TYPE_ORDER.some((shift) => shift === value);
}

/** Ngày vận hành bắt đầu lúc 06h VN; 00–06h thuộc ca đêm của ngày trước. */
export function currentGroundingSlot(now = new Date()): GroundingSlot {
  const hour = vietnamNow(now).getUTCHours();
  return {
    date: vietnamDayKey(hour < 6 ? new Date(now.getTime() - 86400000) : now),
    shiftType: hour >= 6 && hour < 14 ? "MORNING" : hour >= 14 && hour < 22 ? "AFTERNOON" : "NIGHT",
  };
}

export function groundingSlotWindow(slot: GroundingSlot) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slot.date) || !isGroundingShift(slot.shiftType)) {
    throw new Error("Ngày hoặc ca kiểm tra không hợp lệ");
  }
  const midnight = new Date(`${slot.date}T00:00:00+07:00`);
  if (!Number.isFinite(midnight.getTime()) || vietnamDayKey(midnight) !== slot.date) {
    throw new Error("Ngày kiểm tra không hợp lệ");
  }
  const hour = { MORNING: 6, AFTERNOON: 14, NIGHT: 22 }[slot.shiftType];
  const start = new Date(midnight.getTime() + hour * 3600000);
  return { start, end: new Date(start.getTime() + 8 * 3600000) };
}

export function sameGroundingSlot(a: GroundingSlot, b: GroundingSlot) {
  return a.date === b.date && a.shiftType === b.shiftType;
}

/**
 * Chia từng cương vị + tổ máy thành 3 tuyến cố định theo thứ tự khu vực trong sổ.
 * Phải truyền TOÀN BỘ danh mục của mỗi nhóm, trước khi lọc từ khoá/kết quả/phân trang.
 * Mỗi khu vực chỉ giao cho một ca; nhóm có 1–2 khu vực có ca không được giao nhiệm vụ.
 * Danh mục thay đổi thì tuyến được chia lại; lịch sử vẫn giữ thời điểm và kết quả thật.
 */
export function assignGroundingShifts(items: readonly GroundingScheduleItem[]) {
  const groups = new Map<string, GroundingScheduleItem[]>();
  for (const item of items) {
    const key = JSON.stringify([item.positionCode || normalizeText(item.position ?? ""), item.machine]);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  const assignments = new Map<string, ShiftTypeKey[]>();
  for (const group of groups.values()) {
    group.sort((a, b) => a.areaEquipment.localeCompare(b.areaEquipment, "vi") || a.id.localeCompare(b.id, "en"));
    group.forEach((item, index) => {
      const shiftIndex = group.length < 3 ? index : Math.floor(index * 3 / group.length);
      const shifts: ShiftTypeKey[] = [SHIFT_TYPE_ORDER[shiftIndex]];
      assignments.set(item.id, shifts);
    });
  }
  return assignments;
}

export function inspectionInGroundingSlot(signedAt: Date | string, slot: GroundingSlot) {
  const { start, end } = groundingSlotWindow(slot);
  const signed = new Date(signedAt).getTime();
  return signed >= start.getTime() && signed < end.getTime();
}

export function requestedGroundingSlot(body: Record<string, unknown>): GroundingSlot | undefined {
  if (body.inspectionDate === undefined && body.shiftType === undefined) return undefined;
  if (typeof body.inspectionDate !== "string" || !isGroundingShift(body.shiftType)) {
    throw new Error("Ngày hoặc ca kiểm tra không hợp lệ");
  }
  const slot = { date: body.inspectionDate, shiftType: body.shiftType };
  groundingSlotWindow(slot);
  return slot;
}
