import { assignGroundingShifts, currentGroundingSlot, groundingInspectionSlot, groundingSlotWindow, sameGroundingSlot, type GroundingScheduleItem, type GroundingSlot } from "@/lib/grounding-inspection-schedule";
import { availableUserPositions, type PositionCarrier } from "@/lib/current-position";
import { normalizePosition, splitMachineSuffix } from "@/lib/pccc-position";
import { vietnamDayKey } from "@/lib/vietnam-time";

export type GroundingDuty = {
  isApproved: boolean;
  positionLabel: string;
  shift: {
    date: Date;
    shiftType: string;
    checkIns: Array<{ status: string; checkOutAt: Date | null }>;
  };
};

export type GroundingReminderGroup = {
  positionCode: string;
  position: string;
  machine: string;
  pending: number;
  total: number;
  href: string;
  workingPosition: string | null;
};

export type GroundingReminder = GroundingSlot & {
  key: string;
  endsAt: string;
  pending: number;
  groups: GroundingReminderGroup[];
  shown: boolean;
};

export type GroundingReminderItem = GroundingScheduleItem & {
  isActive: boolean;
  updatedAt: Date;
  points: Array<{ updatedAt: Date; attachments: Array<{ createdAt: Date }> }>;
  inspections: Array<{ signedAt: Date; inspectionDate: string | null; inspectionShift: string | null }>;
};

/** Danh sách đã duyệt trong đúng ca đang diễn ra; điểm danh sớm không tính là đang trực. */
export function activeGroundingDuties(duties: readonly GroundingDuty[], now: Date) {
  const slot = currentGroundingSlot(now);
  return duties.filter((duty) => duty.isApproved
    && duty.shift.shiftType === slot.shiftType
    && vietnamDayKey(duty.shift.date) === slot.date
    && !duty.shift.checkIns.some((entry) => entry.status === "ABSENT" || entry.checkOutAt !== null));
}

export function groundingDutyMatches(duty: GroundingDuty, item: GroundingScheduleItem) {
  const position = normalizePosition(duty.positionLabel);
  if (!position.code || position.code !== item.positionCode) return false;
  // Các ghế dùng chung (điện, I&C…) có thể không ghi hậu tố tổ máy.
  return !splitMachineSuffix(duty.positionLabel).explicit || position.machine === item.machine;
}

export function groundingItemPending(item: GroundingReminderItem, slot: GroundingSlot) {
  const latest = item.inspections.filter((entry) => sameGroundingSlot(groundingInspectionSlot(entry), slot))
    .sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime())[0];
  if (!latest) return true;
  const changedAt = Math.max(item.updatedAt.getTime(), ...item.points.flatMap((point) => [
    point.updatedAt.getTime(), ...point.attachments.map((attachment) => attachment.createdAt.getTime()),
  ]));
  return latest.signedAt.getTime() < changedAt;
}

/** Chia tuyến bằng toàn danh mục của nhóm, rồi mới lọc theo cương vị trực và ca. */
export function buildGroundingReminder(
  duties: readonly GroundingDuty[], catalog: readonly GroundingReminderItem[], now: Date,
  access: { all: boolean; positionCode: string | null; user: PositionCarrier },
): GroundingReminder | null {
  const active = activeGroundingDuties(duties, now);
  if (!active.length) return null;
  const slot = currentGroundingSlot(now);
  const items = catalog.filter((item) => item.isActive);
  const plan = assignGroundingShifts(items);
  const groups = new Map<string, GroundingReminderGroup>();
  for (const item of items) {
    if (!item.positionCode || !plan.get(item.id)?.includes(slot.shiftType)
      || !active.some((duty) => groundingDutyMatches(duty, item))) continue;
    const workingPosition = availableUserPositions(access.user)
      .find((value) => normalizePosition(value).code === item.positionCode) ?? null;
    if (!access.all && !workingPosition) continue;
    const key = JSON.stringify([item.positionCode, item.machine]);
    let group = groups.get(key);
    if (!group) {
      const params = new URLSearchParams({ positionCode: item.positionCode, machine: item.machine, shiftType: "CURRENT" });
      group = {
        positionCode: item.positionCode, position: normalizePosition(item.position).label ?? item.positionCode,
        machine: item.machine, pending: 0, total: 0, href: `/grounding-lightning?${params}`,
        workingPosition: !access.all && access.positionCode !== item.positionCode ? workingPosition : null,
      };
      groups.set(key, group);
    }
    group.total++;
    if (groundingItemPending(item, slot)) group.pending++;
  }
  const pendingGroups = [...groups.values()].filter((group) => group.pending > 0);
  if (!pendingGroups.length) return null;
  return {
    ...slot, key: `${slot.date}:${slot.shiftType}`, endsAt: groundingSlotWindow(slot).end.toISOString(),
    pending: pendingGroups.reduce((sum, group) => sum + group.pending, 0), groups: pendingGroups, shown: false,
  };
}
