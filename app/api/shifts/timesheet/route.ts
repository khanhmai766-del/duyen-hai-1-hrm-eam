import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Bảng công trực ca: approved attendance for a month. Returns one entry per
 * approved shift assignment — { userId, day, shiftType } — so the roster page can
 * render each staff member's actually-worked (and duyệt-chấm-công-approved) shifts.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    // Only ADMIN sees everyone's timesheet; everyone else sees only their own.
    const scopeToSelf = user.role !== "ADMIN";

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

    const assignments = await prisma.shiftAssignment.findMany({
      where: {
        isApproved: true,
        ...(scopeToSelf ? { userId: user.id } : {}),
        shift: { date: { gte: monthStart, lte: monthEnd } },
      },
      select: {
        userId: true,
        shift: { select: { date: true, shiftType: true } },
      },
    });

    const entries = assignments.map((a) => ({
      userId: a.userId,
      day: a.shift.date.getDate(),
      shiftType: a.shift.shiftType as string,
    }));

    // Approved administrative (hành chính) check-ins → hours per user per day.
    const hcCheckIns = await prisma.hcCheckIn.findMany({
      where: {
        isApproved: true,
        ...(scopeToSelf ? { userId: user.id } : {}),
        group: { date: { gte: monthStart, lte: monthEnd } },
      },
      select: { userId: true, hours: true, group: { select: { date: true, content: true } } },
    });
    const hcEntries = hcCheckIns.map((c) => ({
      userId: c.userId,
      day: c.group.date.getDate(),
      hours: c.hours,
      content: c.group.content,
    }));

    return ok({ month: mo + 1, year: y, entries, hcEntries });
  });
}
