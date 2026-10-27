import type { PrismaClient } from "@prisma/client";
import { currentGroundingSlot, groundingSlotWindow } from "@/lib/grounding-inspection-schedule";
import { activeGroundingDuties, buildGroundingReminder } from "@/lib/grounding-reminder";
import { normalizePosition } from "@/lib/pccc-position";
import type { PositionCarrier } from "@/lib/current-position";

type ReminderDb = Pick<PrismaClient, "shiftAssignment" | "groundingLightningItem" | "groundingShiftReminder">;

export async function getGroundingReminder(
  db: ReminderDb, userId: string,
  access: { all: boolean; positionCode: string | null; user: PositionCarrier }, now = new Date(),
) {
  const slot = currentGroundingSlot(now);
  const { start, end } = groundingSlotWindow(slot);
  const dayStart = new Date(`${slot.date}T00:00:00+07:00`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const duties = await db.shiftAssignment.findMany({
    where: { userId, isApproved: true, shift: { shiftType: slot.shiftType, date: { gte: dayStart, lt: dayEnd } } },
    select: {
      isApproved: true, positionLabel: true,
      shift: { select: { date: true, shiftType: true, checkIns: { where: { userId }, select: { status: true, checkOutAt: true } } } },
    },
  });
  const active = activeGroundingDuties(duties, now);
  const positionCodes = [...new Set(active.map((duty) => normalizePosition(duty.positionLabel).code).filter((code) => code !== null))];
  if (!positionCodes.length) return null;
  const catalog = await db.groundingLightningItem.findMany({
    where: { isActive: true, positionCode: { in: positionCodes } },
    select: {
      id: true, isActive: true, positionCode: true, position: true, machine: true,
      areaEquipment: true, assignedShift: true, updatedAt: true,
      points: { select: { updatedAt: true, attachments: { select: { createdAt: true } } } },
      inspections: {
        where: { OR: [
          { inspectionDate: slot.date },
          { inspectionDate: null, signedAt: { gte: start, lt: end } },
        ] },
        select: { signedAt: true, inspectionDate: true, inspectionShift: true },
      },
    },
  });
  const reminder = buildGroundingReminder(active, catalog, now, access);
  if (!reminder) return null;
  const shown = await db.groundingShiftReminder.findUnique({
    where: { userId_inspectionDate_inspectionShift: { userId, inspectionDate: slot.date, inspectionShift: slot.shiftType } },
    select: { id: true },
  });
  return { ...reminder, shown: Boolean(shown) };
}

/** Khoá unique ở DB bảo đảm hai tab/thiết bị đồng thời chỉ một nơi nhận quyền hiện popup. */
export async function claimGroundingReminder(db: ReminderDb, userId: string, reminder: NonNullable<Awaited<ReturnType<typeof getGroundingReminder>>>) {
  const { count } = await db.groundingShiftReminder.createMany({
    data: { userId, inspectionDate: reminder.date, inspectionShift: reminder.shiftType },
    skipDuplicates: true,
  });
  return count === 1;
}
