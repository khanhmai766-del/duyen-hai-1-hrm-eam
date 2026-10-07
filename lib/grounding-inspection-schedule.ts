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
  assignedShift?: string | null;
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

/** Cho phép hoàn tất tuyến đến hết 2 giờ sau ca; không mở ca chưa bắt đầu. */
export function groundingConfirmationDeadline(slot: GroundingSlot) {
  return new Date(groundingSlotWindow(slot).end.getTime() + 2 * 3600000);
}

export function canConfirmGroundingSlot(slot: GroundingSlot, now = new Date()) {
  return now.getTime() >= groundingSlotWindow(slot).start.getTime()
    && now.getTime() < groundingConfirmationDeadline(slot).getTime();
}

export function previousGroundingSlot(now = new Date()): GroundingSlot {
  const start = groundingSlotWindow(currentGroundingSlot(now)).start;
  return currentGroundingSlot(new Date(start.getTime() - 1));
}

/** Lượt mới lưu ca được chọn; dữ liệu cũ vẫn xác định ca theo thời điểm ký. */
export function groundingInspectionSlot(inspection: {
  signedAt: Date | string; inspectionDate?: string | null; inspectionShift?: string | null;
}): GroundingSlot {
  if (inspection.inspectionDate && isGroundingShift(inspection.inspectionShift)) {
    return { date: inspection.inspectionDate, shiftType: inspection.inspectionShift };
  }
  return currentGroundingSlot(new Date(inspection.signedAt));
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
    const fixedCounts = SHIFT_TYPE_ORDER.map(() => 0);
    const automatic = group.filter((item) => {
      if (!isGroundingShift(item.assignedShift)) return true;
      assignments.set(item.id, [item.assignedShift]);
      fixedCounts[SHIFT_TYPE_ORDER.indexOf(item.assignedShift)]++;
      return false;
    });
    // Tôn trọng ca cố định; phần tự động bù vào các ca ít khu vực nhất.
    const targets = [...fixedCounts];
    for (let i = 0; i < automatic.length; i++) {
      const least = Math.min(...targets);
      targets[targets.indexOf(least)]++;
    }
    let cursor = 0;
    SHIFT_TYPE_ORDER.forEach((shift, index) => {
      for (let n = fixedCounts[index]; n < targets[index]; n++) {
        assignments.set(automatic[cursor++].id, [shift]);
      }
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
