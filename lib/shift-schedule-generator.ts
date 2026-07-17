import { Prisma, ShiftSlot, ShiftType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DAY_MS = 86_400_000;
const UNIT = "Vận hành 1";
type GenerateInput = {
  year: number;
  month: number;
  positionIds?: string[];
  generatedFromDate?: string;
  basedOnVersionId?: string | null;
  generationReason: string;
  actorId: string;
};
type Warning = { date: string; positionId: string; shiftType: ShiftType; message: string };

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
function isoDay(value: Date) {
  return value.toISOString().slice(0, 10);
}
function eachDay(from: Date, to: Date) {
  const result: Date[] = [];
  for (let time = from.getTime(); time <= to.getTime(); time += DAY_MS) result.push(new Date(time));
  return result;
}
function overlaps(from: Date, to: Date | null, at: Date) {
  return from <= at && (!to || to >= at);
}
function cycleIndex(at: Date, start: Date, length: number) {
  const raw = Math.floor((at.getTime() - start.getTime()) / DAY_MS) % length;
  return (raw + length) % length;
}

export async function generateShiftSchedule(input: GenerateInput) {
  const firstDay = new Date(Date.UTC(input.year, input.month - 1, 1));
  const lastDay = new Date(Date.UTC(input.year, input.month, 0));
  const generatedFrom = input.generatedFromDate
    ? new Date(Math.max(utcDate(input.generatedFromDate).getTime(), firstDay.getTime()))
    : firstDay;
  if (generatedFrom > lastDay) throw new Error("Ngày bắt đầu tính lại nằm ngoài tháng cần tạo");

  return prisma.$transaction(async (tx) => {
    const [positions, assignments, crewRotations, positionRotations, baseVersion, latest] = await Promise.all([
      tx.shiftPositionConfig.findMany({
        where: { isActive: true, ...(input.positionIds?.length ? { id: { in: input.positionIds } } : {}) },
      }),
      tx.shiftStaffingAssignment.findMany({
        where: {
          assignmentType: "OFFICIAL",
          startDate: { lte: lastDay },
          OR: [{ endDate: null }, { endDate: { gte: firstDay } }],
          ...(input.positionIds?.length ? { positionId: { in: input.positionIds } } : {}),
        },
        include: { user: { select: { employeeId: true } } },
      }),
      tx.crewRotationConfig.findMany({
        where: {
          effectiveFrom: { lte: lastDay },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: firstDay } }],
          ...(input.positionIds?.length ? { positionConfigId: { in: input.positionIds } } : {}),
        },
        include: { rotationTemplate: true },
      }),
      tx.positionRotationAssignment.findMany({
        where: {
          effectiveFrom: { lte: lastDay },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: firstDay } }],
          ...(input.positionIds?.length ? { positionConfigId: { in: input.positionIds } } : {}),
        },
        include: { rotationTemplate: true },
      }),
      input.basedOnVersionId
        ? tx.shiftScheduleVersion.findUnique({ where: { id: input.basedOnVersionId }, include: { entries: true } })
        : Promise.resolve(null),
      tx.shiftScheduleVersion.findFirst({
        where: { unit: UNIT, year: input.year, month: input.month },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      }),
    ]);
    if (!positions.length) throw new Error("Không có cương vị phù hợp để phát sinh lịch");
    const selectedPositionIds = new Set(positions.map((item) => item.id));
    const warnings: Warning[] = [];
    const entries: Prisma.ShiftScheduleEntryCreateManyInput[] = [];
    const occupied = new Set<string>();

    if (baseVersion) {
      for (const entry of baseVersion.entries) {
        const shouldRegenerate =
          entry.date >= generatedFrom &&
          selectedPositionIds.has(entry.positionConfigId) &&
          !entry.isLocked;
        if (!shouldRegenerate) {
          entries.push({
            scheduleVersionId: "pending",
            date: entry.date,
            shiftType: entry.shiftType,
            positionConfigId: entry.positionConfigId,
            stationCode: entry.stationCode,
            employeeId: entry.employeeId,
            source: entry.source,
            isLocked: entry.isLocked,
            note: entry.note,
          });
          occupied.add(`${isoDay(entry.date)}:${entry.shiftType}:${entry.employeeId}`);
        }
      }
    }

    for (const day of eachDay(generatedFrom, lastDay)) {
      for (const position of positions) {
        const activePeople = assignments.filter(
          (item) => item.positionId === position.id && overlaps(item.startDate, item.endDate, day),
        );
        const scheduled: Array<{ employeeId: string; stationCode: ShiftSlot | null; shiftType: ShiftType }> = [];
        for (const assignment of activePeople) {
          if (!assignment.crewCode) continue;
          const crewConfig = crewRotations.find(
            (item) =>
              item.positionConfigId === position.id &&
              item.crewCode === assignment.crewCode &&
              overlaps(item.effectiveFrom, item.effectiveTo, day),
          );
          const fallbackRotation = positionRotations.find(
            (item) => item.positionConfigId === position.id && overlaps(item.effectiveFrom, item.effectiveTo, day),
          );
          // Mẫu đang áp dụng cho cương vị là nguồn chuẩn. Cấu hình kíp chỉ là
          // dữ liệu tương thích cho các bản ghi cũ khi cương vị chưa có mẫu chung.
          const template = fallbackRotation?.rotationTemplate ?? crewConfig?.rotationTemplate;
          const cycleStart = assignment.cycleStartDate ?? crewConfig?.cycleStartDate;
          if (!template || (!cycleStart && assignment.phaseIndex === null)) continue;
          const pattern = template.cyclePattern as string[];
          const index = cycleStart
            ? cycleIndex(day, cycleStart, template.cycleLength)
            : (assignment.phaseIndex! + cycleIndex(day, assignment.startDate, template.cycleLength)) % template.cycleLength;
          const state = pattern[index];
          if (state === "MORNING" || state === "AFTERNOON" || state === "NIGHT") {
            scheduled.push({
              employeeId: assignment.user.employeeId,
              stationCode: assignment.stationCode,
              shiftType: state as ShiftType,
            });
          }
        }

        for (const shiftType of [ShiftType.MORNING, ShiftType.AFTERNOON, ShiftType.NIGHT]) {
          const people = scheduled.filter((item) => item.shiftType === shiftType);
          const fixed = people.filter((item) => item.stationCode !== ShiftSlot.FLEX);
          const flex = people.filter((item) => item.stationCode === ShiftSlot.FLEX);
          let s1 = fixed.filter((item) => item.stationCode === ShiftSlot.S1).length;
          let s2 = fixed.filter((item) => item.stationCode === ShiftSlot.S2).length;
          const required = shiftType === ShiftType.MORNING
            ? position.requiredMorningStaff
            : shiftType === ShiftType.AFTERNOON
              ? position.requiredAfternoonStaff
              : position.requiredNightStaff;
          const flexNeeded = required === null
            ? flex
            : flex.slice(0, Math.max(0, required - fixed.length));
          const resolved = [
            ...fixed,
            ...flexNeeded.map((item) => {
              const stationCode = position.positionType === "S1_S2"
                ? (s1 <= s2 ? ShiftSlot.S1 : ShiftSlot.S2)
                : null;
              if (stationCode === ShiftSlot.S1) s1 += 1;
              if (stationCode === ShiftSlot.S2) s2 += 1;
              return { ...item, stationCode };
            }),
          ];
          for (const item of resolved) {
            const key = `${isoDay(day)}:${shiftType}:${item.employeeId}`;
            if (occupied.has(key)) {
              warnings.push({ date: isoDay(day), positionId: position.id, shiftType, message: `Nhân sự ${item.employeeId} bị trùng lịch` });
              continue;
            }
            occupied.add(key);
            entries.push({
              scheduleVersionId: "pending",
              date: day,
              shiftType,
              positionConfigId: position.id,
              stationCode: item.stationCode === ShiftSlot.FLEX ? null : item.stationCode,
              employeeId: item.employeeId,
              source: "GENERATED",
              isLocked: false,
            });
          }
          if (required !== null && resolved.length < required) {
            warnings.push({
              date: isoDay(day),
              positionId: position.id,
              shiftType,
              message: `Thiếu ${required - resolved.length} người`,
            });
          }
        }
      }
    }

    const version = await tx.shiftScheduleVersion.create({
      data: {
        unit: UNIT,
        year: input.year,
        month: input.month,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        status: "DRAFT",
        generatedFromDate: generatedFrom,
        basedOnVersionId: baseVersion?.id ?? null,
        generationReason: input.generationReason,
        generationWarnings: warnings,
        createdById: input.actorId,
      },
    });
    if (entries.length) {
      await tx.shiftScheduleEntry.createMany({
        data: entries.map((entry) => ({ ...entry, scheduleVersionId: version.id })),
      });
    }
    const obsoleteDrafts = await tx.shiftScheduleVersion.findMany({
      where: { unit: UNIT, year: input.year, month: input.month, status: "DRAFT" },
      orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
      skip: 2,
      select: { id: true },
    });
    if (obsoleteDrafts.length) {
      await tx.shiftScheduleVersion.deleteMany({
        where: { id: { in: obsoleteDrafts.map((draft) => draft.id) } },
      });
    }
    return tx.shiftScheduleVersion.findUniqueOrThrow({
      where: { id: version.id },
      include: {
        entries: { include: { positionConfig: { select: { name: true } } }, orderBy: [{ date: "asc" }, { shiftType: "asc" }] },
        createdBy: { select: { name: true } },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function generateNextMonthDraft(actorId: string, reason = "Khởi tạo thủ công lịch dự kiến tháng sau") {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const base = await prisma.shiftScheduleVersion.findFirst({
    where: { unit: UNIT, status: "PUBLISHED" },
    orderBy: [{ year: "desc" }, { month: "desc" }, { versionNumber: "desc" }],
  });
  return generateShiftSchedule({
    year: target.getUTCFullYear(),
    month: target.getUTCMonth() + 1,
    basedOnVersionId: base?.year === target.getUTCFullYear() && base.month === target.getUTCMonth() + 1 ? base.id : null,
    generationReason: reason,
    actorId,
  });
}
