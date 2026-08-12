import type { ShiftTypeKey } from "@/lib/constants";

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Ca vận hành hiện tại theo giờ Việt Nam, độc lập múi giờ của máy chủ. */
export function currentVietnamDefectShift(now = new Date()): {
  shiftType: ShiftTypeKey;
  label: string;
  timeLabel: string;
  start: Date;
  end: Date;
} {
  const vietnam = new Date(now.getTime() + VIETNAM_OFFSET_MS);
  const hour = vietnam.getUTCHours();
  const dayStartUtc = Date.UTC(
    vietnam.getUTCFullYear(),
    vietnam.getUTCMonth(),
    vietnam.getUTCDate()
  ) - VIETNAM_OFFSET_MS;

  if (hour >= 6 && hour < 14) {
    return {
      shiftType: "MORNING",
      label: "Ca sáng",
      timeLabel: "06:00–14:00",
      start: new Date(dayStartUtc + 6 * 60 * 60 * 1000),
      end: new Date(dayStartUtc + 14 * 60 * 60 * 1000),
    };
  }
  if (hour >= 14 && hour < 22) {
    return {
      shiftType: "AFTERNOON",
      label: "Ca chiều",
      timeLabel: "14:00–22:00",
      start: new Date(dayStartUtc + 14 * 60 * 60 * 1000),
      end: new Date(dayStartUtc + 22 * 60 * 60 * 1000),
    };
  }
  const nightStart = hour >= 22
    ? dayStartUtc + 22 * 60 * 60 * 1000
    : dayStartUtc - 2 * 60 * 60 * 1000;
  return {
    shiftType: "NIGHT",
    label: "Ca đêm",
    timeLabel: "22:00–06:00",
    start: new Date(nightStart),
    end: new Date(nightStart + 8 * 60 * 60 * 1000),
  };
}
