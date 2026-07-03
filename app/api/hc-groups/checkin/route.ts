import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { hasAssignedApprovePermission } from "@/lib/rbac-permissions";
import { normalizeHcPeriod } from "@/lib/hc-period";
import { normalizeText } from "@/lib/nav";
import { dateRange as localDateRange } from "@/lib/utils";

export const dynamic = "force-dynamic";

const APPROVE_PERMISSION_ID = "hc-attendance-approve";
const HC_SELF_PERIODS = {
  FULL_DAY: { label: "Cả ngày", hours: 8 },
  MORNING: { label: "Buổi sáng", hours: 4 },
  AFTERNOON: { label: "Buổi chiều", hours: 4 },
  MORNING_OFF: { label: "Ra ca sáng", hours: 3 },
} as const;
const HC_SELF_CONTENTS = Object.values(HC_SELF_PERIODS).map((p) => `Hành chính - ${p.label}`);
const DEFAULT_REGISTER_NOTE = "Chờ phân công";
const RECALL_WINDOW_MS = 5 * 60 * 1000;
const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";
const HC_SELF_AUTO_APPROVE_POSITIONS = ["quan doc", "pho quan doc", "ky thuat vien", "thong ke"];
let hcCheckInUpdatedAtReady = false;

async function ensureHcCheckInUpdatedAtColumn() {
  if (hcCheckInUpdatedAtReady) return;
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "HcCheckIn"
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  `);
  hcCheckInUpdatedAtReady = true;
}

function dayRange(date: string | Date) {
  return localDateRange(date);
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addCalendarDays(from: Date, days: number) {
  const d = startOfDay(from);
  d.setDate(d.getDate() + days);
  return d;
}

function canRegisterForDate(target: Date, now = new Date()) {
  return startOfDay(target).getTime() >= addCalendarDays(now, 2).getTime();
}

function isBeforeRegistrationCutoff(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setHours(16, 30, 0, 0);
  return now.getTime() < cutoff.getTime();
}

function vietnamDateInput(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function canRecallCheckIn(checkIn: { updatedAt?: Date | null; createdAt: Date }, now = new Date()) {
  const markedAt = checkIn.updatedAt ?? checkIn.createdAt;
  return now.getTime() - markedAt.getTime() <= RECALL_WINDOW_MS;
}

async function canManageHc(user: { id?: string; role?: string }) {
  return hasAssignedApprovePermission(user, APPROVE_PERMISSION_ID);
}

function isAutoApprovedHcPosition(position?: string | null) {
  const normalized = normalizeText(position ?? "");
  return HC_SELF_AUTO_APPROVE_POSITIONS.some((keyword) => normalized.includes(keyword));
}

/** POST — current user checks themselves into a group, or registers HC directly. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await ensureHcCheckInUpdatedAtColumn();
    const body = await req.json();
    const { groupId, hours, date, period, note, workNote } = body as {
      groupId?: string;
      hours?: number;
      date?: string;
      period?: keyof typeof HC_SELF_PERIODS;
      note?: string;
      workNote?: string;
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
      const cleanWorkNote = workNote?.trim() || null;
      const registerNote = cleanNote ?? DEFAULT_REGISTER_NOTE;
      const autoApproveSelfCheckIn = !hasNote && isAutoApprovedHcPosition(user.position);
      const existingRegistration = await prisma.hcCheckIn.findFirst({
        where: {
          userId: user.id,
          isRegistered: true,
          group: {
            date: { gte: start, lte: end },
            content: { in: HC_SELF_CONTENTS },
          },
        },
        include: { group: true },
      });
      if (!hasNote && existingRegistration) return fail("Ngày này đã có đăng ký đi hành chính, chỉ được cập nhật nội dung công việc");
      if (hasNote) {
        if (!isBeforeRegistrationCutoff()) {
          return fail("Chỉ được đăng ký đi hành chính trước 16h30");
        }
        if (!existingRegistration && !canRegisterForDate(start)) {
          return fail("Phải đăng ký trước tối thiểu 2 ngày");
        }
      } else if (date !== vietnamDateInput()) {
        return fail("Chỉ được chấm công hành chính trong ngày hiện tại");
      }

      if (existingRegistration) {
        const checkIn = await prisma.hcCheckIn.update({
          where: { id: existingRegistration.id },
          data: { note: registerNote },
        });
        await audit(user.id, "HC_REGISTER_UPDATE", "HcCheckIn", checkIn.id, "Cập nhật nội dung đăng ký đi hành chính");
        return ok(checkIn);
      }

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
            period: normalizeHcPeriod(period),
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
        update: {
          hours: option.hours,
          isApproved: autoApproveSelfCheckIn,
          ...(hasNote ? { note: registerNote, isRegistered: true } : { note: cleanWorkNote, isRegistered: false }),
        },
        create: {
          groupId: group.id,
          userId: user.id,
          hours: option.hours,
          isApproved: autoApproveSelfCheckIn,
          isRegistered: hasNote,
          note: hasNote ? registerNote : cleanWorkNote,
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
    await ensureHcCheckInUpdatedAtColumn();
    const groupId = req.nextUrl.searchParams.get("groupId");
    const checkInId = req.nextUrl.searchParams.get("checkInId");
    if (checkInId) {
      if (!(await canManageHc(user))) return fail("Không đủ quyền truy cập", 403);
      const checkIn = await prisma.hcCheckIn.findUnique({
        where: { id: checkInId },
        include: { user: { select: { name: true } } },
      });
      if (!checkIn) return fail("Không tìm thấy chấm công hành chính", 404);
      await prisma.hcCheckIn.delete({ where: { id: checkInId } });
      await audit(
        user.id,
        checkIn.isRegistered ? "HC_REGISTER_CANCEL" : "HC_REJECT",
        "HcCheckIn",
        checkInId,
        checkIn.isRegistered ? `Hủy đăng ký đi hành chính của ${checkIn.user.name}` : `Không duyệt chấm công HC của ${checkIn.user.name}`
      );
      return ok({ removed: 1 });
    }
    if (!groupId) return fail("Thiếu nhóm");
    const checkIn = await prisma.hcCheckIn.findUnique({ where: { groupId_userId: { groupId, userId: user.id } } });
    if (checkIn?.isRegistered) return fail("Đăng ký đi hành chính không được tự hủy");
    if (!checkIn) return fail("Không tìm thấy điểm danh hành chính", 404);
    if (!canRecallCheckIn(checkIn)) return fail("Chỉ được thu hồi trong vòng 5 phút kể từ lúc chấm công", 403);
    await prisma.hcCheckIn.deleteMany({ where: { groupId, userId: user.id, isRegistered: false } });
    await audit(user.id, "HC_RECALL", "HcCheckIn", groupId, "Thu hồi điểm danh hành chính");
    return ok({ removed: 1 });
  });
}

/** PUT — approve check-ins of a group (ADMIN / Trưởng ca). `ids` to approve
 *  specific members, otherwise approve everyone in the group. */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    const { groupId, ids, note, action } = body as { groupId: string; ids?: string[]; note?: string; action?: "APPROVE" | "NOTE" };
    if (!groupId) return fail("Thiếu nhóm");
    const where =
      Array.isArray(ids) && ids.length ? { id: { in: ids }, groupId } : { groupId };
    const cleanNote = note?.trim();
    if (action === "NOTE") {
      if (!Array.isArray(ids) || ids.length !== 1) return fail("Thiếu đăng ký cần cập nhật");
      const target = await prisma.hcCheckIn.findFirst({ where: { id: ids[0], groupId } });
      if (!target) return fail("Không tìm thấy chấm công hành chính", 404);
      if (target.userId !== user.id && !(await canManageHc(user))) return fail("Không đủ quyền truy cập", 403);
      const res = await prisma.hcCheckIn.updateMany({
        where,
        data: { note: cleanNote || null },
      });
      await audit(user.id, "HC_NOTE_UPDATE", "HcGroup", groupId, `Cập nhật nội dung công việc HC (${res.count})`);
      return ok({ updated: res.count });
    }
    if (!(await canManageHc(user))) return fail("Không đủ quyền truy cập", 403);
    const res = await prisma.hcCheckIn.updateMany({
      where,
      data: { isApproved: true, ...(note !== undefined ? { note: cleanNote || null } : {}) },
    });
    await audit(user.id, "HC_APPROVE", "HcGroup", groupId, `Duyệt chấm công HC (${res.count})`);
    return ok({ approved: res.count });
  });
}
