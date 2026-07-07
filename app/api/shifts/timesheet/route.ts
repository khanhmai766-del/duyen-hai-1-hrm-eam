import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireUser, handle } from "@/lib/api";
import { hasAssignedApprovePermission } from "@/lib/rbac-permissions";
import { normalizeHcPeriod } from "@/lib/hc-period";

export const dynamic = "force-dynamic";

const EDIT_TIMESHEET_PERMISSION_ID = "timesheet-edit";
const HC_SELF_CONTENTS = ["Hành chính - Cả ngày", "Hành chính - Buổi sáng", "Hành chính - Buổi chiều", "Hành chính - Ra ca sáng"];
const TIMESHEET_PREVIOUS_MONTH_KEEP_UNTIL_DAY = 15;
const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

function periodSlots(period?: string | null) {
  const normalized = normalizeHcPeriod(period);
  if (normalized === "FULL_DAY") return ["MORNING", "AFTERNOON"];
  if (normalized === "AFTERNOON") return ["AFTERNOON"];
  return ["MORNING"];
}

function adjustedSelfHcEntry(c: {
  hours: number;
  group: { period: string | null };
}, managedSlots: Set<string>) {
  const period = normalizeHcPeriod(c.group.period);
  const selfSlots = periodSlots(period);
  const remainingSlots = selfSlots.filter((slot) => !managedSlots.has(slot));
  if (remainingSlots.length === 0) return null;
  if (period === "FULL_DAY") {
    if (remainingSlots.length === 2) return { hours: c.hours, period };
    const slot = remainingSlots[0];
    return { hours: Math.min(4, c.hours), period: slot };
  }
  return { hours: c.hours, period };
}

function vietnamCalendarParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month) - 1,
    day: Number(values.day),
  };
}

function vietnamMonthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month, 1) - VIETNAM_OFFSET_MS);
  const end = new Date(Date.UTC(year, month + 1, 1) - VIETNAM_OFFSET_MS - 1);
  return { start, end };
}

function vietnamDayOfMonth(date: Date) {
  return vietnamCalendarParts(date).day;
}

function retentionMonthRange(now = new Date()) {
  const current = vietnamCalendarParts(now);
  const keepPreviousMonth = current.day <= TIMESHEET_PREVIOUS_MONTH_KEEP_UNTIL_DAY;
  const start = new Date(current.year, current.month - (keepPreviousMonth ? 1 : 0), 1);
  return {
    min: { year: start.getFullYear(), month: start.getMonth() },
    max: { year: current.year, month: current.month },
  };
}

function monthKey(year: number, monthIndex: number) {
  return year * 12 + monthIndex;
}

function isMonthInRetention(year: number, monthIndex: number) {
  const range = retentionMonthRange();
  const key = monthKey(year, monthIndex);
  return key >= monthKey(range.min.year, range.min.month) && key <= monthKey(range.max.year, range.max.month);
}

function isDateInRetention(date: string) {
  const match = date.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!match) return false;
  return isMonthInRetention(Number(match[1]), Number(match[2]) - 1);
}

async function canEditTimesheet(user: { id?: string; role?: string }) {
  return hasAssignedApprovePermission(user, EDIT_TIMESHEET_PERMISSION_ID);
}

async function ensureTimesheetOverrideTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TimesheetOverride" (
      "userId" TEXT NOT NULL,
      date TEXT NOT NULL,
      value TEXT NOT NULL,
      note TEXT,
      "updatedById" TEXT,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("userId", date)
    )
  `);
  const range = retentionMonthRange();
  const minDate = `${range.min.year}-${String(range.min.month + 1).padStart(2, "0")}-01`;
  await prisma.$executeRawUnsafe(`DELETE FROM "TimesheetOverride" WHERE date < $1`, minDate);
}

/**
 * Bảng công trực ca: attendance for a month. Returns one entry per checked-in
 * shift assignment, including logged hours and approval state, so the roster
 * page can render partial shifts (4V3) and highlight forgotten approvals.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await ensureTimesheetOverrideTable();
    const canEdit = await canEditTimesheet(user);
    // Người có quyền duyệt/chỉnh công xem toàn bộ bảng; người khác chỉ xem dòng của mình.
    const scopeToSelf = !canEdit;

    const monthParam = req.nextUrl.searchParams.get("month"); // YYYY-MM
    const now = new Date();
    const currentVietnamMonth = vietnamCalendarParts(now);
    let y = currentVietnamMonth.year;
    let mo = currentVietnamMonth.month;
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [py, pm] = monthParam.split("-").map(Number);
      y = py;
      mo = pm - 1;
    }
    const { start: monthStart, end: monthEnd } = vietnamMonthRange(y, mo);
    const daysInMonth = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();

    if (!isMonthInRetention(y, mo)) {
      return ok({ month: mo + 1, year: y, entries: [], hcEntries: [], overrides: [], canEdit });
    }

    const assignments = await prisma.shiftAssignment.findMany({
      where: {
        ...(scopeToSelf ? { userId: user.id } : {}),
        shift: { date: { gte: monthStart, lte: monthEnd } },
      },
      select: {
        shiftId: true,
        userId: true,
        isApproved: true,
        shift: { select: { date: true, shiftType: true } },
      },
    });
    const checkIns = await prisma.checkIn.findMany({
      where: {
        ...(scopeToSelf ? { userId: user.id } : {}),
        shift: { date: { gte: monthStart, lte: monthEnd } },
      },
      select: {
        shiftId: true,
        userId: true,
        note: true,
        shift: { select: { date: true, shiftType: true, isAttendanceLocked: true } },
      },
    });
    const hoursByUserShift = new Map<string, number>();
    for (const checkIn of checkIns) {
      const parsed = parseShiftHours(checkIn.note);
      const key = `${checkIn.userId}:${checkIn.shiftId}`;
      if (parsed.explicit || !hoursByUserShift.has(key)) {
        hoursByUserShift.set(key, parsed.hours);
      }
    }

    const assignmentKeys = new Set(assignments.map((a) => `${a.userId}:${a.shiftId}`));
    const entries = assignments.map((a) => ({
      userId: a.userId,
      day: vietnamDayOfMonth(a.shift.date),
      shiftType: a.shift.shiftType as string,
      hours: hoursByUserShift.get(`${a.userId}:${a.shiftId}`) ?? 8,
      isApproved: a.isApproved,
    }));
    for (const checkIn of checkIns) {
      const key = `${checkIn.userId}:${checkIn.shiftId}`;
      if (assignmentKeys.has(key) || !checkIn.shift.isAttendanceLocked) continue;
      entries.push({
        userId: checkIn.userId,
        day: vietnamDayOfMonth(checkIn.shift.date),
        shiftType: checkIn.shift.shiftType as string,
        hours: hoursByUserShift.get(key) ?? 8,
        isApproved: true,
      });
    }

    // Approved administrative (hành chính) check-ins → hours per user per day.
    const hcCheckIns = await prisma.hcCheckIn.findMany({
      where: {
        isApproved: true,
        ...(scopeToSelf ? { userId: user.id } : {}),
        group: { date: { gte: monthStart, lte: monthEnd } },
      },
      select: { userId: true, hours: true, note: true, group: { select: { date: true, content: true, period: true } } },
    });
    const managedSlotsByUserDay = new Map<string, Set<string>>();
    for (const c of hcCheckIns) {
      if (HC_SELF_CONTENTS.includes(c.group.content)) continue;
      const key = `${c.userId}:${vietnamDayOfMonth(c.group.date)}`;
      const slots = managedSlotsByUserDay.get(key) ?? new Set<string>();
      periodSlots(c.group.period).forEach((slot) => slots.add(slot));
      managedSlotsByUserDay.set(key, slots);
    }
    const hcEntries = hcCheckIns
      .map((c) => {
        const day = vietnamDayOfMonth(c.group.date);
        const override = HC_SELF_CONTENTS.includes(c.group.content)
          ? adjustedSelfHcEntry(c, managedSlotsByUserDay.get(`${c.userId}:${day}`) ?? new Set())
          : { hours: c.hours, period: c.group.period };
        if (!override) return null;
        return {
          userId: c.userId,
          day,
          hours: override.hours,
          content: c.group.content,
          period: override.period,
          note: c.note,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const overrideRows = await prisma.$queryRawUnsafe<
      {
        userId: string;
        date: string;
        value: string;
        note: string | null;
        updatedAt: Date;
        updatedById: string | null;
        updatedByName: string | null;
      }[]
    >(
      `
        SELECT o."userId", o.date, o.value, o.note, o."updatedAt", o."updatedById", u.name AS "updatedByName"
        FROM "TimesheetOverride" o
        LEFT JOIN "User" u ON u.id = o."updatedById"
        WHERE o.date >= $1 AND o.date <= $2
        ${scopeToSelf ? `AND o."userId" = $3` : ""}
        ORDER BY o.date ASC
      `,
      `${y}-${String(mo + 1).padStart(2, "0")}-01`,
      `${y}-${String(mo + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`,
      ...(scopeToSelf ? [user.id] : [])
    );
    const overrides = overrideRows.map((row) => ({
      userId: row.userId,
      date: row.date,
      day: Number(row.date.slice(8, 10)),
      value: row.value,
      note: row.note,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedById ? { id: row.updatedById, name: row.updatedByName ?? "—" } : null,
    }));

    return ok({ month: mo + 1, year: y, entries, hcEntries, overrides, canEdit });
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await ensureTimesheetOverrideTable();
    if (!(await canEditTimesheet(user))) return fail("Bạn không có quyền chỉnh bảng công", 403);

    const body = (await req.json()) as Record<string, unknown>;
    const userId = String(body.userId ?? "").trim();
    const date = String(body.date ?? "").trim();
    const value = String(body.value ?? "").trim();
    const note = String(body.note ?? "").trim() || null;

    if (!userId) return fail("Thiếu nhân viên cần chỉnh công");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Ngày bảng công không hợp lệ");
    if (!isDateInRetention(date)) return fail("Bảng công tháng trước chỉ lưu đến ngày 15 của tháng hiện tại", 400);
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
    if (!target) return fail("Không tìm thấy nhân viên", 404);

    if (!value) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "TimesheetOverride" WHERE "userId" = $1 AND date = $2`,
        userId,
        date
      );
      await audit(user.id, "DELETE_TIMESHEET_OVERRIDE", "TimesheetOverride", `${userId}:${date}`, target.name);
      return ok({ userId, date, value: "" });
    }

    if (value.length > 40) return fail("Giá trị ô bảng công tối đa 40 ký tự");
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "TimesheetOverride" ("userId", date, value, note, "updatedById", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        ON CONFLICT ("userId", date)
        DO UPDATE SET value = EXCLUDED.value, note = EXCLUDED.note, "updatedById" = EXCLUDED."updatedById", "updatedAt" = CURRENT_TIMESTAMP
      `,
      userId,
      date,
      value,
      note,
      user.id
    );
    await audit(user.id, "UPDATE_TIMESHEET_OVERRIDE", "TimesheetOverride", `${userId}:${date}`, `${target.name}: ${value}`);
    return ok({ userId, date, value, note });
  });
}

function parseShiftHours(note: string | null) {
  const match = note?.match(/^\s*(\d+(?:[,.]\d+)?)\s*h/i);
  if (!match) return { hours: 8, explicit: false };
  const hours = Number(match[1].replace(",", "."));
  return { hours: Number.isFinite(hours) && hours > 0 ? hours : 8, explicit: true };
}
