import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";

export const dynamic = "force-dynamic";

const MANAGER = ["ADMIN", "SUPERVISOR"];

/** POST — current user checks themselves into a group (chọn số giờ). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    const { groupId, hours } = body as { groupId: string; hours?: number };
    if (!groupId) return fail("Thiếu nhóm");

    const group = await prisma.hcGroup.findUnique({ where: { id: groupId } });
    if (!group) return fail("Không tìm thấy nhóm", 404);

    const h = Math.min(8, Math.max(1, Math.round(Number(hours) || group.hours)));
    const checkIn = await prisma.hcCheckIn.upsert({
      where: { groupId_userId: { groupId, userId: user.id } },
      update: { hours: h, isApproved: false },
      create: { groupId, userId: user.id, hours: h },
    });
    await audit(user.id, "HC_CHECKIN", "HcCheckIn", checkIn.id, `Điểm danh hành chính (${checkIn.hours}h)`);
    return ok(checkIn);
  });
}

/** DELETE ?groupId= — current user recalls their own check-in. */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const groupId = req.nextUrl.searchParams.get("groupId");
    if (!groupId) return fail("Thiếu nhóm");
    await prisma.hcCheckIn.deleteMany({ where: { groupId, userId: user.id } });
    await audit(user.id, "HC_RECALL", "HcCheckIn", groupId, "Thu hồi điểm danh hành chính");
    return ok({ removed: 1 });
  });
}

/** PUT — approve check-ins of a group (ADMIN / Trưởng ca). `ids` to approve
 *  specific members, otherwise approve everyone in the group. */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, MANAGER);
    const body = await req.json();
    const { groupId, ids } = body as { groupId: string; ids?: string[] };
    if (!groupId) return fail("Thiếu nhóm");
    const where =
      Array.isArray(ids) && ids.length ? { id: { in: ids }, groupId } : { groupId };
    const res = await prisma.hcCheckIn.updateMany({ where, data: { isApproved: true } });
    await audit(user.id, "HC_APPROVE", "HcGroup", groupId, `Duyệt chấm công HC (${res.count})`);
    return ok({ approved: res.count });
  });
}
