import { fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { assignGroundingShifts, currentGroundingSlot, canConfirmGroundingSlot, type GroundingScheduleItem, type GroundingSlot } from "@/lib/grounding-inspection-schedule";

/** Kiểm tra cả ca thật trên máy chủ và tuyến được giao; không tin bộ lọc/đồng hồ client. */
export function assertGroundingInspectionSlot(
  item: GroundingScheduleItem, catalog: readonly GroundingScheduleItem[], requested?: GroundingSlot, now = new Date(),
) {
  const slot = requested ?? currentGroundingSlot(now);
  if (!canConfirmGroundingSlot(slot, now)) {
    throw fail("Chỉ được cập nhật và xác nhận trong ca hoặc trong 2 giờ sau khi hết ca. Vui lòng tải lại danh sách ca", 409);
  }
  if (!assignGroundingShifts(catalog).get(item.id)?.includes(slot.shiftType)) {
    throw fail("Khu vực này không thuộc tuyến kiểm tra của ca đã chọn", 409);
  }
  return slot;
}

export async function requireGroundingInspectionSlot(item: GroundingScheduleItem, requested?: GroundingSlot, now = new Date()) {
  const catalog = await prisma.groundingLightningItem.findMany({
    where: { isActive: true, positionCode: item.positionCode ?? null, machine: item.machine },
    select: { id: true, positionCode: true, position: true, machine: true, areaEquipment: true, assignedShift: true },
  });
  return assertGroundingInspectionSlot(item, catalog, requested, now);
}
