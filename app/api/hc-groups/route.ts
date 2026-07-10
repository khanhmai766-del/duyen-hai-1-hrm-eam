import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { userWithSignedMedia } from "@/lib/s3";
import { normalizeHcPeriod } from "@/lib/hc-period";
import { hcRetentionStartInput } from "@/lib/hc-retention";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { dateRange, parseDateInput } from "@/lib/utils";

export const dynamic = "force-dynamic";

let hcCheckInUpdatedAtReady = false;

async function ensureHcCheckInUpdatedAtColumn() {
  if (hcCheckInUpdatedAtReady) return;
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "HcCheckIn"
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  `);
  hcCheckInUpdatedAtReady = true;
}

/** Số giờ chấm công hợp lệ: 1–8. */
function clampHours(h: unknown): number {
  const n = Math.round(Number(h) || 8);
  return Math.min(8, Math.max(1, n));
}

// Retention: HC attendance keeps the previous month through day 15 of the
// current month. Older groups are purged with their members via cascade.
function retentionCutoff(): Date {
  return parseDateInput(hcRetentionStartInput());
}
async function purgeExpiredHc(): Promise<void> {
  await prisma.hcGroup.deleteMany({ where: { date: { lt: retentionCutoff() } } });
}

/** GET /api/hc-groups?date=YYYY-MM-DD — groups (with members) for a day. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    await ensureHcCheckInUpdatedAtColumn();
    // Enforce the 1-month retention window on every load.
    await purgeExpiredHc();
    const dateParam = req.nextUrl.searchParams.get("date");
    const { start, end } = dateRange(dateParam);

    const groups = await prisma.hcGroup.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { createdAt: "asc" },
      include: {
        createdBy: { select: { id: true, name: true } },
        members: {
          include: { user: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true, phone: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const hydratedGroups = await Promise.all(
      groups.map(async (group) => ({
        ...group,
        members: await Promise.all(
          group.members.map(async (member) => ({
            ...member,
            user: await userWithSignedMedia(member.user),
          }))
        ),
      }))
    );
    return ok(hydratedGroups);
  });
}

/** POST /api/hc-groups — create a managed administrative group. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "hc-attendance-group-create", ["create", "manage", "full"], "Không đủ quyền tạo nhóm hành chính");
    const body = await req.json();
    const { date, content, hours, unit, period } = body as { date: string; content: string; hours?: number; unit?: string; period?: string };
    if (!date || !content?.trim()) return fail("Thiếu ngày hoặc nội dung");
    const groupPeriod = normalizeHcPeriod(period);

    const group = await prisma.hcGroup.create({
      data: {
        date: parseDateInput(date),
        content: content.trim(),
        hours: clampHours(hours),
        period: groupPeriod,
        unit: unit ?? null,
        createdById: user.id,
      },
    });
    // 1-month retention: drop anything older whenever new data is added.
    await purgeExpiredHc();
    await audit(user.id, "CREATE_HC_GROUP", "HcGroup", group.id, `Tạo nhóm hành chính: ${content}`);
    return ok(group);
  });
}

/** PUT /api/hc-groups — edit a group's content/hours (ADMIN / Trưởng ca). */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "hc-attendance-group-create", ["manage", "full"], "Không đủ quyền sửa nhóm hành chính");
    const body = await req.json();
    const { id, content, hours, period } = body as { id: string; content?: string; hours?: number; period?: string };
    if (!id) return fail("Thiếu id nhóm");
    const groupPeriod = period === undefined ? undefined : normalizeHcPeriod(period);
    const group = await prisma.hcGroup.update({
      where: { id },
      data: {
        ...(content !== undefined ? { content: content.trim() } : {}),
        ...(hours !== undefined ? { hours: clampHours(hours) } : {}),
        ...(groupPeriod !== undefined ? { period: groupPeriod } : {}),
      },
    });
    await audit(user.id, "UPDATE_HC_GROUP", "HcGroup", id, "Sửa nhóm hành chính");
    return ok(group);
  });
}

/** DELETE /api/hc-groups?id= — delete a group (ADMIN / Trưởng ca). */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "hc-attendance-group-create", ["manage", "full"], "Không đủ quyền xoá nhóm hành chính");
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return fail("Thiếu id nhóm");
    await prisma.hcGroup.delete({ where: { id } });
    await audit(user.id, "DELETE_HC_GROUP", "HcGroup", id, "Xoá nhóm hành chính");
    return ok({ removed: 1 });
  });
}
