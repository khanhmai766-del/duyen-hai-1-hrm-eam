import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { addDays } from "@/lib/constants";

/**
 * Đánh dấu một kế hoạch bảo trì đã thực hiện:
 *  - ghi một MaintenanceRecord (lịch sử),
 *  - cập nhật lastDoneAt = thời điểm thực hiện,
 *  - dời nextDueAt = thời điểm thực hiện + chu kỳ.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR", "TECHNICIAN"]);
    const body = await req.json().catch(() => ({}));

    const plan = await prisma.maintenancePlan.findUnique({
      where: { id: params.id },
      include: { device: { select: { code: true } } },
    });
    if (!plan) return fail("Không tìm thấy kế hoạch bảo trì", 404);

    const doneAt = body.doneAt ? new Date(body.doneAt) : new Date();
    const cost = body.cost != null && body.cost !== "" ? Number(body.cost) : null;

    const [, updated] = await prisma.$transaction([
      prisma.maintenanceRecord.create({
        data: {
          planId: plan.id,
          doneById: user.id,
          doneAt,
          note: body.note || null,
          cost: Number.isFinite(cost as number) ? cost : null,
        },
      }),
      prisma.maintenancePlan.update({
        where: { id: plan.id },
        data: {
          lastDoneAt: doneAt,
          nextDueAt: addDays(doneAt, plan.intervalDays),
        },
        include: {
          device: { select: { id: true, code: true, name: true, category: true, location: true } },
          assignee: { select: { id: true, name: true, position: true } },
          _count: { select: { records: true } },
        },
      }),
    ]);

    await audit(user.id, "COMPLETE_MAINTENANCE", "MaintenancePlan", plan.id, `${plan.device.code} — ${plan.title}`);
    return ok(updated);
  });
}
