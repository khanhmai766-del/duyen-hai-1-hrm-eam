import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";

export const dynamic = "force-dynamic";

const MANAGER = ["ADMIN", "SUPERVISOR"];
const HC_SELF_PERIODS = {
  FULL_DAY: { label: "Cả ngày", hours: 8 },
  MORNING: { label: "Buổi sáng", hours: 4 },
  AFTERNOON: { label: "Buổi chiều", hours: 4 },
} as const;
const HC_SELF_CONTENTS = Object.values(HC_SELF_PERIODS).map((p) => `Hành chính - ${p.label}`);

function dayRange(date: string | Date) {
  const base = new Date(date);
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** POST — current user checks themselves into a group, or registers HC directly. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    const { groupId, hours, date, period, note } = body as {
      groupId?: string;
      hours?: number;
      date?: string;
      period?: keyof typeof HC_SELF_PERIODS;
      note?: string;
    };

    if (!groupId) {
      if (!date) return fail("Thiếu ngày");
      if (!period || !(period in HC_SELF_PERIODS)) return fail("Thiếu buổi");

      const option = HC_SELF_PERIODS[period];
      const content = `Hành chính - ${option.label}`;
      const { start, end } = dayRange(date);
      if (Number.isNaN(start.getTime())) return fail("Ngày không hợp lệ");
      const hasNote = Object.prototype.hasOwnProperty.call(body, "note");
      const cleanNote = note?.trim() || null;
      const group =
        (await prisma.hcGroup.findFirst({
          where: {
            date: { gte: start, lte: end },
            content,
          },
        })) ??
        (await prisma.hcGroup.create({
          data: {
            date: start,
            content,
            hours: option.hours,
            createdById: user.id,
          },
        }));

      await prisma.hcCheckIn.deleteMany({
        where: {
          userId: user.id,
          groupId: { not: group.id },
          group: {
            date: { gte: start, lte: end },
            content: { in: HC_SELF_CONTENTS },
          },
        },
      });

      const checkIn = await prisma.hcCheckIn.upsert({
        where: { groupId_userId: { groupId: group.id, userId: user.id } },
        update: { hours: option.hours, isApproved: true, ...(hasNote ? { note: cleanNote, isRegistered: true } : {}) },
        create: {
          groupId: group.id,
          userId: user.id,
          hours: option.hours,
          isApproved: true,
          isRegistered: hasNote,
          ...(hasNote ? { note: cleanNote } : {}),
        },
      });
      await audit(
        user.id,
        hasNote ? "HC_REGISTER" : "HC_CHECKIN",
        "HcCheckIn",
        checkIn.id,
        hasNote ? `Đăng ký đi hành chính: ${option.label}` : `Chấm công hành chính: ${option.label}`
      );
      return ok(checkIn);
    }

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
