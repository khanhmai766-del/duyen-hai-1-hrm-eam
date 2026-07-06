import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import { shiftWindow } from "@/lib/constants";
import { s3ProxyUrl } from "@/lib/s3";
import { aggregateHcHoursByPeriod, normalizeHcPeriod } from "@/lib/hc-period";
import { vietnamTodayUtcMidnight } from "@/lib/utils";

export const dynamic = "force-dynamic";

const HC_SELF_CONTENTS = ["Hành chính - Cả ngày", "Hành chính - Buổi sáng", "Hành chính - Buổi chiều", "Hành chính - Ra ca sáng"];

function periodSlots(period?: string | null) {
  const normalized = normalizeHcPeriod(period);
  if (normalized === "FULL_DAY") return ["MORNING", "AFTERNOON"];
  if (normalized === "AFTERNOON") return ["AFTERNOON"];
  return ["MORNING"];
}

function adjustedSelfHcEntry(c: { hours: number; group: { period: string | null } }, managedSlots: Set<string>) {
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
      include: { shift: { select: { date: true, shiftType: true } } },
    });
    const attendanceDays = Array.from(
      new Set(monthApproved.map((a) => a.shift.date.getDate()))
    ).sort((a, b) => a - b);
    const shiftHours = monthApproved.length * 8;
    const morningShiftDays = new Set(
      monthApproved
        .filter((a) => a.shift.shiftType === "MORNING")
        .map((a) => a.shift.date.getDate())
    );

    // Administrative (hành chính) attendance for the month → the second chart
    // series. Approved HC check-ins, keyed by day with their logged hours.
    const monthHc = await prisma.hcCheckIn.findMany({
      where: {
        userId: user.id,
        isApproved: true,
        group: { date: { gte: monthStart, lte: monthEnd } },
      },
      include: { group: { select: { date: true, content: true, period: true } } },
    });
    const managedSlotsByDay = new Map<number, Set<string>>();
    for (const c of monthHc) {
      if (HC_SELF_CONTENTS.includes(c.group.content)) continue;
      const day = c.group.date.getDate();
      const slots = managedSlotsByDay.get(day) ?? new Set<string>();
      periodSlots(c.group.period).forEach((slot) => slots.add(slot));
      managedSlotsByDay.set(day, slots);
    }
    const adminMap = new Map<number, Array<{ hours: number; period: string | null }>>();
    for (const c of monthHc) {
      const d = c.group.date.getDate();
      const override = HC_SELF_CONTENTS.includes(c.group.content)
        ? adjustedSelfHcEntry(c, managedSlotsByDay.get(d) ?? new Set())
        : { hours: c.hours, period: c.group.period };
      if (!override) continue;
      const entries = adminMap.get(d) ?? [];
      entries.push({ hours: override.hours, period: override.period });
      adminMap.set(d, entries);
    }
    const adminDays = Array.from(adminMap, ([day, entries]) => ({
      day,
      hours: aggregateHcHoursByPeriod(entries, { hasMorningShift: morningShiftDays.has(day) }),
    })).sort(
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

    // Đã CHẤM CÔNG HÀNH CHÍNH hôm nay? (Quản đốc/Phó Quản đốc/Kỹ thuật viên/Thống kê).
    // Server chạy UTC nhưng HcGroup.date lưu theo NGÀY VIỆT NAM (midnight UTC của ngày VN),
    // nên phải tính "hôm nay" theo giờ VN để khớp — tránh lệch ngày lúc 0–7h sáng.
    const hcDayStart = vietnamTodayUtcMidnight(now);
    const hcDayEnd = new Date(hcDayStart);
    hcDayEnd.setUTCDate(hcDayEnd.getUTCDate() + 1);
    hcDayEnd.setUTCMilliseconds(-1);
    const adminSelfToday = await prisma.hcCheckIn.findFirst({
      where: {
        userId: user.id,
        isRegistered: false,
        group: { date: { gte: hcDayStart, lte: hcDayEnd }, content: { in: HC_SELF_CONTENTS } },
      },
      select: { id: true },
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
      adminCheckedInToday: !!adminSelfToday,
      month: mo + 1,
      year: y,
    });
  });
}
