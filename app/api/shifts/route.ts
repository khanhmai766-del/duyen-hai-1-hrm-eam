import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import { userWithSignedMedia } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  getOrSetShiftDetailCache,
  getOrSetShiftListCache,
  invalidateShiftCache,
  shiftDetailCacheKey,
} from "@/lib/shift-response-cache";
import { dateRange, parseDateInput } from "@/lib/utils";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const sp = req.nextUrl.searchParams;
    const date = sp.get("date");
    const shiftType = sp.get("shiftType");
    const unit = sp.get("unit");

    // For org-chart / check-in we usually want one shift; otherwise list.
    if (date) {
      const { start, end } = dateRange(date);

      const shift = await getOrSetShiftDetailCache(shiftDetailCacheKey({ date, shiftType, unit }), async () => {
        const record = await prisma.shift.findFirst({
          where: {
            date: { gte: start, lte: end },
            ...(shiftType ? { shiftType: shiftType as any } : {}),
            ...(unit ? { unit } : {}),
          },
          include: {
            assignments: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    phone: true,
                    avatarUrl: true,
                    signatureUrl: true,
                    avatarKey: true,
                    signatureKey: true,
                    position: true,
                    secondaryPosition: true,
                  },
                },
              },
            },
            checkIns: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    position: true,
                    secondaryPosition: true,
                    avatarUrl: true,
                    avatarKey: true,
                  },
                },
              },
            },
            handovers: true,
          },
        });
        if (!record) return null;
        const assignments = await Promise.all(
          record.assignments.map(async (assignment) => ({
            ...assignment,
            user: await userWithSignedMedia(assignment.user),
          }))
        );
        const checkIns = await Promise.all(
          record.checkIns.map(async (checkIn) => ({
            ...checkIn,
            user: await userWithSignedMedia(checkIn.user),
          }))
        );
        return { ...record, assignments, checkIns };
      });
      return ok(shift);
    }

    const shifts = await getOrSetShiftListCache(() =>
      prisma.shift.findMany({
        orderBy: { date: "desc" },
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
              user: { select: { id: true, name: true, position: true, secondaryPosition: true } },
            },
          },
        },
      })
    );
    return ok(shifts);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "shift-operation-check-in", ["create", "manage", "full"], "Không đủ quyền tạo ca vận hành");
    const body = await req.json();
    const shift = await prisma.shift.create({
      data: {
        date: parseDateInput(body.date),
        shiftType: body.shiftType,
        unit: body.unit,
      },
    });
    invalidateShiftCache();
    return ok(shift);
  });
}
