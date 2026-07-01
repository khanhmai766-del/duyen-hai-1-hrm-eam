import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, requireRole, handle } from "@/lib/api";
import { userWithSignedMedia } from "@/lib/s3";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const sp = req.nextUrl.searchParams;
    const date = sp.get("date");
    const shiftType = sp.get("shiftType");
    const unit = sp.get("unit");

    // For org-chart / check-in we usually want one shift; otherwise list.
    if (date) {
      const day = new Date(date);
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59, 999);

      const shift = await prisma.shift.findFirst({
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
      if (!shift) return ok(null);
      const assignments = await Promise.all(
        shift.assignments.map(async (assignment) => ({
          ...assignment,
          user: await userWithSignedMedia(assignment.user),
        }))
      );
      const checkIns = await Promise.all(
        shift.checkIns.map(async (checkIn) => ({
          ...checkIn,
          user: await userWithSignedMedia(checkIn.user),
        }))
      );
      return ok({ ...shift, assignments, checkIns });
    }

    const shifts = await prisma.shift.findMany({
      orderBy: { date: "desc" },
      include: { assignments: { include: { user: true } } },
    });
    return ok(shifts);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR"]);
    const body = await req.json();
    const shift = await prisma.shift.create({
      data: {
        date: new Date(body.date),
        shiftType: body.shiftType,
        unit: body.unit,
      },
    });
    return ok(shift);
  });
}
