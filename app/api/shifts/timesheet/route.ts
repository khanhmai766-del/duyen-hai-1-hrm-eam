import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireUser, handle } from "@/lib/api";
import { hasAssignedApprovePermission } from "@/lib/rbac-permissions";

export const dynamic = "force-dynamic";

const APPROVE_PERMISSION_ID = "shift-approve";
const MANAGER = new Set(["ADMIN", "SUPERVISOR"]);

function retentionMonthRange(now = new Date()) {
  const current = { year: now.getFullYear(), month: now.getMonth() };
  const start = new Date(current.year, current.month - 1, 1);
  return {
    min: { year: start.getFullYear(), month: start.getMonth() },
    max: current,
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
  return MANAGER.has(user.role ?? "") || hasAssignedApprovePermission(user, APPROVE_PERMISSION_ID);
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
    let y = now.getFullYear();
    let mo = now.getMonth();
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [py, pm] = monthParam.split("-").map(Number);
      y = py;
      mo = pm - 1;
    }
    const monthStart = new Date(y, mo, 1);
    const monthEnd = new Date(y, mo + 1, 0, 23, 59, 59, 999);

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
      day: a.shift.date.getDate(),
      shiftType: a.shift.shiftType as string,
      hours: hoursByUserShift.get(`${a.userId}:${a.shiftId}`) ?? 8,
      isApproved: a.isApproved,
    }));
    for (const checkIn of checkIns) {
      const key = `${checkIn.userId}:${checkIn.shiftId}`;
      if (assignmentKeys.has(key) || !checkIn.shift.isAttendanceLocked) continue;
      entries.push({
        userId: checkIn.userId,
        day: checkIn.shift.date.getDate(),
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
    const hcEntries = hcCheckIns.map((c) => ({
      userId: c.userId,
      day: c.group.date.getDate(),
      hours: c.hours,
      content: c.group.content,
      period: c.group.period,
      note: c.note,
    }));

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
      `${y}-${String(mo + 1).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`,
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
    if (!isDateInRetention(date)) return fail("Bảng công chỉ lưu trữ và chỉnh sửa trong 2 tháng gần nhất", 400);
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
