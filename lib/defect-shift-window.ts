import type { ShiftTypeKey } from "@/lib/constants";

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Ca đang hiển thị trên bảng tổng hợp phiếu theo giờ Việt Nam.
 *
 * Màn hình đổi ca trễ 2 giờ so với giờ vận hành thực tế để ca vừa kết thúc có
 * thời gian rà soát phiếu: sáng 08–16, chiều 16–24, đêm 00–08. `start`/`end`
 * vẫn là giờ ca thực tế dùng truy vấn phiếu: 06–14, 14–22, 22–06.
 */
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

  if (hour >= 8 && hour < 16) {
    return {
      shiftType: "MORNING",
      label: "Ca sáng",
      timeLabel: "Hiển thị 08:00–16:00",
      start: new Date(dayStartUtc + 6 * 60 * 60 * 1000),
      end: new Date(dayStartUtc + 14 * 60 * 60 * 1000),
    };
  }
  if (hour >= 16) {
    return {
      shiftType: "AFTERNOON",
      label: "Ca chiều",
      timeLabel: "Hiển thị 16:00–24:00",
      start: new Date(dayStartUtc + 14 * 60 * 60 * 1000),
      end: new Date(dayStartUtc + 22 * 60 * 60 * 1000),
    };
  }
  // 00:00–08:00 vẫn giữ bảng tổng hợp ca đêm vừa kết thúc. Ca đêm bắt đầu
  // lúc 22:00 của ngày hôm trước và dữ liệu kết thúc tại 06:00 hôm nay.
  const nightStart = dayStartUtc - 2 * 60 * 60 * 1000;
  return {
    shiftType: "NIGHT",
    label: "Ca đêm",
    timeLabel: "Hiển thị 00:00–08:00",
    start: new Date(nightStart),
    end: new Date(nightStart + 8 * 60 * 60 * 1000),
  };
}
