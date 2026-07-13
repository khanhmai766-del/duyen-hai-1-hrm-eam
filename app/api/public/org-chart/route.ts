import type { NextRequest } from "next/server";
import type { ShiftType as PrismaShiftType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, handle } from "@/lib/api";
import { SHIFT_TYPE_ORDER, type ShiftTypeKey } from "@/lib/constants";
import { dateRange, vietnamNow } from "@/lib/utils";
import { ORG_SEAT_TITLES } from "@/lib/org-template";

export const dynamic = "force-dynamic";

const DEFAULT_UNIT = "Vận hành 1";

function localDateFromVietnamClock(now: Date) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function realtimeShiftInVietnam(now = new Date()): { date: string; shiftType: ShiftTypeKey } {
  const vn = vietnamNow(now);
  const h = vn.getUTCHours();
  if (h >= 6 && h < 14) return { date: localDateFromVietnamClock(vn), shiftType: "MORNING" };
  if (h >= 14 && h < 22) return { date: localDateFromVietnamClock(vn), shiftType: "AFTERNOON" };
  if (h < 6) vn.setUTCDate(vn.getUTCDate() - 1);
  return { date: localDateFromVietnamClock(vn), shiftType: "NIGHT" };
}

function isShiftType(value: string | null): value is ShiftTypeKey {
  return Boolean(value && SHIFT_TYPE_ORDER.includes(value as ShiftTypeKey));
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const sp = req.nextUrl.searchParams;
    const current = realtimeShiftInVietnam();
    const date = sp.get("date") || current.date;
    const shiftType: PrismaShiftType = (isShiftType(sp.get("shiftType")) ? sp.get("shiftType")! : current.shiftType) as PrismaShiftType;
    const unit = sp.get("unit") || DEFAULT_UNIT;
    const { start, end } = dateRange(date);

    const shift = await prisma.shift.findFirst({
      where: {
        date: { gte: start, lte: end },
        shiftType,
        unit,
      },
      select: {
        id: true,
        date: true,
        shiftType: true,
        unit: true,
        isAttendanceLocked: true,
        assignments: {
          select: {
            id: true,
            userId: true,
            positionLabel: true,
            parentId: true,
            isApproved: true,
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
                phone: true,
                position: true,
                secondaryPosition: true,
              },
            },
          },
        },
      },
    });

    const order = new Map(ORG_SEAT_TITLES.map((title, index) => [title, index]));
    const assignments = [...(shift?.assignments ?? [])].sort((a, b) => {
      const bySeat = (order.get(a.positionLabel) ?? 999) - (order.get(b.positionLabel) ?? 999);
      if (bySeat !== 0) return bySeat;
      return a.user.name.localeCompare(b.user.name, "vi");
    });

    return ok({
      date,
      shiftType,
      unit,
      shift: shift ? { ...shift, assignments } : null,
    });
  });
}
