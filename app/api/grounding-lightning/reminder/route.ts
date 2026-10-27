import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { GROUNDING_PERMISSIONS, groundingScopeWithPermissions } from "@/lib/grounding-lightning";
import { prisma } from "@/lib/prisma";
import { hasPermissionLevel } from "@/lib/rbac-guard";
import { claimGroundingReminder, getGroundingReminder } from "@/lib/server/grounding-reminder";
import { currentGroundingSlot } from "@/lib/grounding-inspection-schedule";

export const dynamic = "force-dynamic";

async function context() {
  const user = await requireUser();
  const canRead = await hasPermissionLevel(user, GROUNDING_PERMISSIONS.view, ["read", "personal", "manage", "full"]);
  if (!canRead || user.mustChangePassword) return { user, reminder: null };
  const scope = await groundingScopeWithPermissions(user);
  const canInspect = scope.all || await hasPermissionLevel(user, GROUNDING_PERMISSIONS.manage, ["personal", "manage", "full"]);
  if (!canInspect) return { user, reminder: null };
  // primaryPosition giữ cương vị hồ sơ; user.position là cương vị đang chọn.
  const access = { ...scope, user: { ...user, position: user.primaryPosition } };
  const reminder = await getGroundingReminder(prisma, user.id, access);
  return { user, reminder };
}

export async function GET() {
  return handle(async () => {
    const { reminder } = await context();
    return ok(reminder);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = await req.json().catch(() => null);
    const { user, reminder } = await context();
    if (!body || typeof body.key !== "string") return fail("Thiếu thông tin ca cần nhắc");
    if (!reminder || reminder.key !== body.key || reminder.shown) return ok(null);
    const current = currentGroundingSlot();
    if (current.date !== reminder.date || current.shiftType !== reminder.shiftType) return ok(null);
    if (!(await claimGroundingReminder(prisma, user.id, reminder))) return ok(null);
    await audit(user.id, "SHOW_GROUNDING_SHIFT_REMINDER", "GroundingShiftReminder", reminder.key,
      `Nhắc kiểm tra tiếp địa & chống sét: còn ${reminder.pending} vị trí`);
    return ok({ ...reminder, shown: true });
  });
}
