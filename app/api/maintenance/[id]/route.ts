import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireUser();
    const plan = await prisma.maintenancePlan.findUnique({
      where: { id: params.id },
      include: {
        device: { select: { id: true, code: true, name: true, category: true, location: true } },
        assignee: { select: { id: true, name: true, position: true } },
        records: {
          orderBy: { doneAt: "desc" },
          include: { doneBy: { select: { id: true, name: true, position: true } } },
        },
      },
    });
    if (!plan) return fail("Không tìm thấy kế hoạch bảo trì", 404);
    return ok(plan);
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR", "TECHNICIAN"]);
    const body = await req.json();

    const intervalDays = body.intervalDays != null ? Number(body.intervalDays) : undefined;
    if (intervalDays != null && (!Number.isFinite(intervalDays) || intervalDays < 1)) {
      return fail("Chu kỳ phải là số ngày hợp lệ (≥ 1)");
    }

    const plan = await prisma.maintenancePlan.update({
      where: { id: params.id },
      data: {
        title: body.title,
        description: body.description ?? null,
        intervalDays,
        priority: body.priority,
        assigneeId: body.assigneeId || null,
        nextDueAt: body.nextDueAt ? new Date(body.nextDueAt) : undefined,
        lastDoneAt: body.lastDoneAt ? new Date(body.lastDoneAt) : undefined,
        isActive: body.isActive,
      },
      include: {
        device: { select: { id: true, code: true, name: true, category: true, location: true } },
        assignee: { select: { id: true, name: true, position: true } },
        _count: { select: { records: true } },
      },
    });
    await audit(user.id, "UPDATE_MAINTENANCE", "MaintenancePlan", plan.id, plan.title);
    return ok(plan);
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR"]);
    await prisma.maintenancePlan.delete({ where: { id: params.id } });
    await audit(user.id, "DELETE_MAINTENANCE", "MaintenancePlan", params.id);
    return ok({ id: params.id });
  });
}
