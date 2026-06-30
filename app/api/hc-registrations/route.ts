import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import { hasAssignedApprovePermission } from "@/lib/rbac-permissions";
import { userWithSignedMedia } from "@/lib/s3";

export const dynamic = "force-dynamic";

const APPROVE_PERMISSION_ID = "shift-approve";
const MANAGER = ["ADMIN", "TECHNICIAN"];
const HC_SELF_CONTENTS = ["Hành chính - Cả ngày", "Hành chính - Buổi sáng", "Hành chính - Ra ca sáng", "Hành chính - Buổi chiều"];

function dayStart(date: string | null) {
  const d = date ? new Date(date) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** GET /api/hc-registrations?from=YYYY-MM-DD — đăng ký HC từ ngày chỉ định trở đi. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const canManage = MANAGER.includes(user.role) || (await hasAssignedApprovePermission(user, APPROVE_PERMISSION_ID));
    const from = dayStart(req.nextUrl.searchParams.get("from"));

    const registrations = await prisma.hcCheckIn.findMany({
      where: {
        isRegistered: true,
        ...(canManage ? {} : { userId: user.id }),
        group: {
          date: { gte: from },
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
