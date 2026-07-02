import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { shiftWindow, MAX_EARLY_CHECKINS } from "@/lib/constants";

/**
 * Org-chart check-in ("Điểm danh"): places the current user into a seat
 * (cương vị) of a shift's org chart. Finds-or-creates the shift, then ensures
 * an assignment with the chosen position label exists for this user, and
 * records a CheckIn with the logged hours / shift-swap flag.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    const { date, shiftType, unit, positionLabel } = body as {
      date: string;
      shiftType: string;
      unit: string;
      positionLabel: string;
      hours?: number;
      swap?: boolean;
    };
    if (!date || !shiftType || !unit || !positionLabel?.trim()) {
      return fail("Thiếu thông tin ca trực hoặc cương vị");
    }
    const label = positionLabel.trim();

    // Admin / Trưởng ca may place another user into a seat (the "Thêm" picker in
    // Duyệt chấm công). Everyone else can only check themselves in.
    const targetUserId =
      body.userId && body.userId !== user.id && ["ADMIN", "MANAGER", "SUPERVISOR"].includes(user.role)
        ? (body.userId as string)
        : user.id;

    // Find the shift for this day/type/unit, or create it.
    const day = new Date(date);
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    let shift = await prisma.shift.findFirst({
      where: { date: { gte: start, lte: end }, shiftType: shiftType as any, unit },
      include: { assignments: true },
    });
    if (!shift) {
      shift = await prisma.shift.create({
        data: { date: day, shiftType: shiftType as any, unit },
        include: { assignments: true },
      });
    }
    const managerAddingUser = !!body.userId && ["ADMIN", "MANAGER", "SUPERVISOR"].includes(user.role);
    if (shift.isAttendanceLocked && !managerAddingUser) {
      return fail("Ca trực đã được duyệt hết và khóa điểm danh.", 403);
    }

    // Điểm danh sớm: nếu ca chưa bắt đầu (tương lai) → tính là "điểm danh sớm".
    // Mỗi user chỉ được đặt trước tối đa MAX_EARLY_CHECKINS ca trực.
    const now = new Date();
    const targetStart = shiftWindow(day, shiftType).start;
    const alreadyInTarget = shift.assignments.some((a) => a.userId === targetUserId);
    if (targetStart.getTime() > now.getTime() && !alreadyInTarget) {
      const since = new Date(now);
      since.setHours(0, 0, 0, 0);
      const futureSeats = await prisma.shiftAssignment.findMany({
        where: { userId: targetUserId, shiftId: { not: shift.id }, shift: { date: { gte: since } } },
        include: { shift: { select: { date: true, shiftType: true } } },
      });
      const earlyCount = futureSeats.filter(
        (a) => shiftWindow(a.shift.date, a.shift.shiftType).start.getTime() > now.getTime()
      ).length;
      if (earlyCount >= MAX_EARLY_CHECKINS) {
        return fail(`Chỉ được điểm danh sớm tối đa ${MAX_EARLY_CHECKINS} ca trực.`, 400);
      }
    }

    // Decide where the seat hangs in the hierarchy.
    const chief = shift.assignments.find((a) => !a.parentId);
    const leads = shift.assignments.filter((a) => a.parentId === chief?.id && /Trưởng kíp/i.test(a.positionLabel));
    function resolveParentId(): string | null {
      if (/Trưởng ca/i.test(label)) return null; // chief sits at the root
      if (/Trưởng kíp/i.test(label)) return chief?.id ?? null; // a lead under the chief
      // members attach to the matching lead (điện vs lò-máy), else first lead/chief
      const dien = leads.find((l) => /điện/i.test(l.positionLabel));
      const loMay = leads.find((l) => !/điện/i.test(l.positionLabel));
      if (/điện/i.test(label) && dien) return dien.id;
      return (loMay ?? dien ?? chief)?.id ?? null;
    }

    // One cương vị per user per shift: clear any previous seat the target held in
    // this shift, then place them into the chosen seat.
    await prisma.shiftAssignment.deleteMany({ where: { shiftId: shift.id, userId: targetUserId } });
    const assignment = await prisma.shiftAssignment.create({
      data: {
        shiftId: shift.id,
        userId: targetUserId,
        positionLabel: label,
        parentId: resolveParentId(),
        isApproved: false,
      },
    });

    // Record the attendance (hours + swap) for the target user on this shift.
    const swapNote = typeof body.swapNote === "string" ? body.swapNote.trim() : "";
    const note = `${body.hours ?? 8}h${body.swap ? ` · trực đổi ca${swapNote ? `: ${swapNote}` : ""}` : ""}`;
    const existingCheckIn = await prisma.checkIn.findFirst({ where: { shiftId: shift.id, userId: targetUserId } });
    if (existingCheckIn) {
      await prisma.checkIn.update({
        where: { id: existingCheckIn.id },
        data: { checkInAt: new Date(), status: "PRESENT", note },
      });
    } else {
      await prisma.checkIn.create({
        data: { shiftId: shift.id, userId: targetUserId, status: "PRESENT", checkInAt: new Date(), note },
      });
    }

    await audit(user.id, "CHECK_IN", "ShiftAssignment", assignment.id, `Điểm danh: ${label}`);
    return ok(assignment);
  });
}

/**
 * Thu hồi điểm danh: removes the current user's own seat(s) + attendance record
 * for the given shift, so their card disappears from the org chart.
 */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const sp = req.nextUrl.searchParams;

    // Admin/Trưởng ca removing a specific seat (rejecting a check-in).
    const id = sp.get("id");
    if (id) {
      requireRole(user, ["ADMIN", "MANAGER", "SUPERVISOR"]);
      const target = await prisma.shiftAssignment.findUnique({ where: { id } });
      if (!target) return fail("Không tìm thấy phân công", 404);
      const targetShift = await prisma.shift.findUnique({ where: { id: target.shiftId }, select: { isAttendanceLocked: true } });
      await prisma.shiftAssignment.updateMany({ where: { parentId: id }, data: { parentId: target.parentId } });
      await prisma.shiftAssignment.delete({ where: { id } });
      if (!targetShift?.isAttendanceLocked || !target.isApproved) {
        await prisma.checkIn.deleteMany({ where: { shiftId: target.shiftId, userId: target.userId } });
      }
      await audit(user.id, "REMOVE_CHECKIN", "ShiftAssignment", id, "Xoá điểm danh");
      return ok({ removed: 1 });
    }

    // Otherwise: self-recall (the logged-in user withdraws their own check-in).
    const date = sp.get("date");
    const shiftType = sp.get("shiftType");
    const unit = sp.get("unit");
    if (!date || !shiftType || !unit) return fail("Thiếu thông tin ca trực");

    const day = new Date(date);
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    const shift = await prisma.shift.findFirst({
      where: { date: { gte: start, lte: end }, shiftType: shiftType as any, unit },
    });
    if (!shift) return fail("Không tìm thấy ca trực", 404);

    const mine = await prisma.shiftAssignment.findMany({ where: { shiftId: shift.id, userId: user.id } });

    // Khi chấm công đã được duyệt, user dưới quyền Quản trị / Trưởng ca không
    // được tự thu hồi điểm danh (chỉ ADMIN / SUPERVISOR mới thu hồi được).
    const isManager = ["ADMIN", "MANAGER", "SUPERVISOR"].includes(user.role);
    if (!isManager && mine.some((a) => a.isApproved)) {
      return fail("Chấm công đã được duyệt — bạn không thể thu hồi điểm danh. Vui lòng liên hệ Quản trị / Quản lý / Trưởng ca.", 403);
    }

    // Re-point any children onto the removed node's parent so subtrees aren't orphaned.
    for (const a of mine) {
      await prisma.shiftAssignment.updateMany({ where: { parentId: a.id }, data: { parentId: a.parentId } });
    }
    await prisma.shiftAssignment.deleteMany({ where: { id: { in: mine.map((a) => a.id) } } });
    await prisma.checkIn.deleteMany({ where: { shiftId: shift.id, userId: user.id } });

    await audit(user.id, "RECALL_CHECKIN", "ShiftAssignment", shift.id, "Thu hồi điểm danh");
    return ok({ removed: mine.length });
  });
}

/**
 * Duyệt chấm công: ADMIN / Trưởng ca (SUPERVISOR) approves check-ins for a shift.
 * Pass `ids` to approve specific seats, otherwise approves every seat in the shift.
 */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "MANAGER", "SUPERVISOR"]);
    const body = await req.json();
    const { date, shiftType, unit, ids } = body as {
      date: string;
      shiftType: string;
      unit: string;
      ids?: string[];
    };
    if (!date || !shiftType || !unit) return fail("Thiếu thông tin ca trực");

    const day = new Date(date);
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    const shift = await prisma.shift.findFirst({
      where: { date: { gte: start, lte: end }, shiftType: shiftType as any, unit },
    });
    if (!shift) return fail("Không tìm thấy ca trực", 404);

    const where = Array.isArray(ids) && ids.length
      ? { id: { in: ids }, shiftId: shift.id }
      : { shiftId: shift.id };
    const res = await prisma.shiftAssignment.updateMany({ where, data: { isApproved: true } });
    const approveAll = !(Array.isArray(ids) && ids.length);
    if (approveAll) {
      await prisma.shift.update({ where: { id: shift.id }, data: { isAttendanceLocked: true } });
    }

    await audit(user.id, "APPROVE_CHECKIN", "Shift", shift.id, approveAll ? `Duyệt hết chấm công (${res.count})` : `Duyệt chấm công (${res.count})`);
    return ok({ approved: res.count, locked: approveAll });
  });
}
