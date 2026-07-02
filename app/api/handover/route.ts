import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { invalidateShiftCache } from "@/lib/shift-response-cache";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    if (!body.shiftId || !body.fromUserId || !body.toUserId) {
      return fail("Thiếu thông tin bàn giao");
    }
    const handover = await prisma.shiftHandover.create({
      data: {
        shiftId: body.shiftId,
        fromUserId: body.fromUserId,
        toUserId: body.toUserId,
        handoverAt: new Date(),
        notes: body.notes || null,
        issues: body.issues || null,
      },
    });
    await audit(user.id, "CREATE_HANDOVER", "ShiftHandover", handover.id);
    invalidateShiftCache();
    return ok(handover);
  });
}
