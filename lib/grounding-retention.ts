import { currentGroundingSlot, groundingSlotWindow } from "@/lib/grounding-inspection-schedule";

export const GROUNDING_RETENTION_DESCRIPTION = "Lịch sử kiểm tra được lưu trong 1 tháng 15 ngày gần nhất. Danh mục và kết quả hiện tại vẫn được giữ.";

/** Lùi một tháng lịch rồi 15 ngày, chặn ngày cuối tháng; giữ trọn ngày vận hành từ 06h VN. */
export function groundingRetentionWindow(now = new Date()) {
  const [year, month, day] = currentGroundingSlot(now).date.split("-").map(Number);
  const previousMonth = new Date(Date.UTC(year, month - 2, 1));
  const lastDay = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  previousMonth.setUTCDate(Math.min(day, lastDay) - 15);
  const date = `${previousMonth.getUTCFullYear()}-${String(previousMonth.getUTCMonth() + 1).padStart(2, "0")}-${String(previousMonth.getUTCDate()).padStart(2, "0")}`;
  return { date, cutoff: groundingSlotWindow({ date, shiftType: "MORNING" }).start };
}
