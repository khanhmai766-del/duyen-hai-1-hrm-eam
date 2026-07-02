import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { invalidateShiftCache } from "@/lib/shift-response-cache";

// POST = create or update a check-in record (check in / check out / set status)
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    const { shiftId, userId, action } = body as {
      shiftId: string;
      userId: string;
      action: "CHECK_IN" | "CHECK_OUT" | "SET_STATUS";
    };
    if (!shiftId || !userId) return fail("Thiếu shiftId hoặc userId");

    const existing = await prisma.checkIn.findFirst({ where: { shiftId, userId } });

    let data: any = {};
    if (action === "CHECK_IN") data = { checkInAt: new Date(), status: body.status || "PRESENT" };
    else if (action === "CHECK_OUT") data = { checkOutAt: new Date() };
    else data = { status: body.status, note: body.note };

    const record = existing
      ? await prisma.checkIn.update({ where: { id: existing.id }, data })
      : await prisma.checkIn.create({
          data: { shiftId, userId, status: body.status || "PRESENT", ...data },
        });

    await audit(user.id, "CHECK_IN", "CheckIn", record.id, action);
    invalidateShiftCache();
    return ok(record);
  });
}

// PUT = approve a check-in (SUPERVISOR / ADMIN)
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "shift-operation-approve", ["approve", "manage", "full"], "Không đủ quyền duyệt");
    const body = await req.json();
    if (!body.checkInId) return fail("Thiếu checkInId");
    const record = await prisma.checkIn.update({
      where: { id: body.checkInId },
      data: { approvedBy: user.id },
    });
    await audit(user.id, "APPROVE_CHECKIN", "CheckIn", record.id);
    invalidateShiftCache();
    return ok(record);
  });
}
