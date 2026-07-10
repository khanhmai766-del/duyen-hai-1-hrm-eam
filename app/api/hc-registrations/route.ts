import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import { hcRetentionStartInput } from "@/lib/hc-retention";
import { hasAssignedApprovePermission } from "@/lib/rbac-permissions";
import { userWithSignedMedia } from "@/lib/s3";
import { parseDateInput } from "@/lib/utils";

export const dynamic = "force-dynamic";

const APPROVE_PERMISSION_ID = "hc-attendance-approve";
const HC_SELF_CONTENTS = ["Hành chính - Cả ngày", "Hành chính - Buổi sáng", "Hành chính - Ra ca sáng", "Hành chính - Buổi chiều"];

function dayStart(date: string | null) {
  const d = parseDateInput(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayEnd(date: string | null) {
  const d = parseDateInput(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** GET /api/hc-registrations?from=YYYY-MM-DD&to=YYYY-MM-DD — đăng ký HC trong khoảng ngày. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const canManage = await hasAssignedApprovePermission(user, APPROVE_PERMISSION_ID);
    const retentionStart = dayStart(hcRetentionStartInput());
    await prisma.hcGroup.deleteMany({ where: { date: { lt: retentionStart } } });
    const requestedFrom = dayStart(req.nextUrl.searchParams.get("from"));
    const from = requestedFrom < retentionStart ? retentionStart : requestedFrom;
    const toParam = req.nextUrl.searchParams.get("to");
    const to = toParam ? dayEnd(toParam) : null;

    const registrations = await prisma.hcCheckIn.findMany({
      where: {
        isRegistered: true,
        ...(canManage ? {} : { userId: user.id }),
        group: {
          date: { gte: from, ...(to ? { lte: to } : {}) },
          content: { in: HC_SELF_CONTENTS },
        },
      },
      include: {
        user: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true, phone: true } },
        group: {
          select: {
            id: true,
            date: true,
            content: true,
            hours: true,
            period: true,
            unit: true,
            createdById: true,
            createdBy: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [
        { group: { date: "asc" } },
        { createdAt: "asc" },
      ],
    });

    const hydratedRegistrations = await Promise.all(
      registrations.map(async (registration) => ({
        ...registration,
        user: await userWithSignedMedia(registration.user),
      }))
    );

    return ok(hydratedRegistrations);
  });
}
