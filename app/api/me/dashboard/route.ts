import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import { shiftWindow } from "@/lib/constants";
import { s3ProxyUrl } from "@/lib/s3-storage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();

    const now = new Date();
    // Optional ?month=YYYY-MM to view a past month's attendance; defaults to current.
    const monthParam = req.nextUrl.searchParams.get("month");
    let y = now.getFullYear();
    let mo = now.getMonth();
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [py, pm] = monthParam.split("-").map(Number);
      y = py;
      mo = pm - 1;
    }
    const monthStart = new Date(y, mo, 1);
    const monthEnd = new Date(y, mo + 1, 0, 23, 59, 59, 999);
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // Approved shift assignments for the month → activity calendar.
    const monthApproved = await prisma.shiftAssignment.findMany({
      where: {
        userId: user.id,
        isApproved: true,
        shift: { date: { gte: monthStart, lte: monthEnd } },
      },
      include: { shift: { select: { date: true } } },
    });
    const attendanceDays = Array.from(
      new Set(monthApproved.map((a) => a.shift.date.getDate()))
    ).sort((a, b) => a - b);
    const shiftHours = monthApproved.length * 8;

    // Administrative (hành chính) attendance for the month → the second chart
    // series. Approved HC check-ins, keyed by day with their logged hours.
    const monthHc = await prisma.hcCheckIn.findMany({
      where: {
        userId: user.id,
        isApproved: true,
        group: { date: { gte: monthStart, lte: monthEnd } },
      },
      include: { group: { select: { date: true } } },
    });
    const adminMap = new Map<number, number>();
    for (const c of monthHc) {
      const d = c.group.date.getDate();
      adminMap.set(d, Math.max(adminMap.get(d) ?? 0, c.hours));
    }
    const adminDays = Array.from(adminMap, ([day, hours]) => ({ day, hours })).sort(
      (a, b) => a.day - b.day
    );
    const adminHours = adminDays.reduce((sum, entry) => sum + entry.hours, 0);
    const workingDays = Math.round(((shiftHours + adminHours) / 8) * 100) / 100;

    // Cương vị trực ca = ca trực GẦN NHẤT CHƯA kết thúc của user (ca đang diễn ra
    // nếu có; nếu không thì ca sắp tới gần nhất đã điểm danh sớm). Ca đã hết giờ
    // bị loại → card tự "reset" khi kết thúc ca để user điểm danh ca sau.
    const dutyFrom = new Date(now);
    dutyFrom.setDate(dutyFrom.getDate() - 1); // gồm cả ca đêm bắt đầu từ hôm trước
    dutyFrom.setHours(0, 0, 0, 0);
    const dutyCandidates = await prisma.shiftAssignment.findMany({
      where: { userId: user.id, shift: { date: { gte: dutyFrom } } },
      include: { shift: { select: { unit: true, shiftType: true, date: true } } },
    });
    const dutyRanked = dutyCandidates
      .map((a) => ({ a, win: shiftWindow(a.shift.date, a.shift.shiftType) }))
      .filter((x) => x.win.end.getTime() > now.getTime()) // chưa kết thúc
      .sort((x, y) => x.win.start.getTime() - y.win.start.getTime());
    const duty = dutyRanked[0]?.a ?? null;
    const dutyApproved = duty?.isApproved ?? false;
    const todayCheckIn = await prisma.checkIn.findFirst({
      where: { userId: user.id, checkInAt: { gte: dayStart, lte: dayEnd } },
      select: { status: true, checkInAt: true, approvedBy: true },
    });

    // Avatar lives in the DB (not the session token) — surface it here.
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true, avatarKey: true },
    });
    const avatarUrl = dbUser?.avatarKey ? s3ProxyUrl(dbUser.avatarKey) : dbUser?.avatarUrl ?? null;

    return ok({
      avatarUrl,
      workingDays,
      attendanceDays,
      adminDays,
      daysInMonth: monthEnd.getDate(),
      // Cương vị / vị trí trực ca của ca gần nhất chưa kết thúc.
      position: dutyApproved ? duty!.positionLabel : null,
      unit: duty ? duty.shift.unit : null,
      pendingPosition: duty && !dutyApproved ? duty.positionLabel : null,
      // Ngày + loại ca của lần điểm danh đang hiển thị.
      dutyDate: duty ? duty.shift.date.toISOString() : null,
      dutyShiftType: duty ? (duty.shift.shiftType as string) : null,
      checkedInToday: !!todayCheckIn?.checkInAt,
      checkInStatus: todayCheckIn?.status ?? null,
      month: mo + 1,
      year: y,
    });
  });
}
