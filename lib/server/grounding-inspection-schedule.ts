import { fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { assignGroundingShifts, currentGroundingSlot, sameGroundingSlot, type GroundingScheduleItem, type GroundingSlot } from "@/lib/grounding-inspection-schedule";

/** Kiểm tra cả ca thật trên máy chủ và tuyến được giao; không tin bộ lọc/đồng hồ client. */
export function assertGroundingInspectionSlot(
  item: GroundingScheduleItem, catalog: readonly GroundingScheduleItem[], requested?: GroundingSlot, now = new Date(),
) {
  const current = currentGroundingSlot(now);
  if (requested && !sameGroundingSlot(requested, current)) {
    throw fail("Chỉ được cập nhật và xác nhận cho ca đang diễn ra. Vui lòng tải lại danh sách ca", 409);
  }
  if (!assignGroundingShifts(catalog).get(item.id)?.includes(current.shiftType)) {
    throw fail("Khu vực này không thuộc tuyến kiểm tra của ca đang diễn ra", 409);
  }
  return current;
}

export async function requireGroundingInspectionSlot(item: GroundingScheduleItem, requested?: GroundingSlot, now = new Date()) {
  const catalog = await prisma.groundingLightningItem.findMany({
    where: { isActive: true, positionCode: item.positionCode ?? null, machine: item.machine },
    select: { id: true, positionCode: true, position: true, machine: true, areaEquipment: true, assignedShift: true },
  });
  return assertGroundingInspectionSlot(item, catalog, requested, now);
}
