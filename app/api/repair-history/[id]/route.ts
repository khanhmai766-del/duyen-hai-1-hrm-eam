import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { assertSeqEditable, assertSeqViewable } from "@/lib/server-access";
import { EQUIPMENT_DEVICE_SELECT, withDeviceAlias } from "@/lib/equipment-device";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const log = await prisma.repairLog.findUnique({
      where: { id: params.id },
      include: {
        device: { select: EQUIPMENT_DEVICE_SELECT },
        createdBy: { select: { id: true, name: true, position: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    });
    if (!log) return fail("Không tìm thấy phiếu sửa chữa", 404);
    await assertSeqViewable(user, log.deviceSeq);
    return ok(withDeviceAlias(log));
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const existing = await prisma.repairLog.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Không tìm thấy phiếu sửa chữa", 404);

    await assertSeqEditable(user, existing.deviceSeq);
    const body = await req.json();

    // Approval is restricted to ADMIN/SUPERVISOR.
    const isApproving = body.approve === true;
    if (isApproving && !["ADMIN", "MANAGER", "SUPERVISOR"].includes(user.role)) {
      return fail("Chỉ Quản trị, Quản lý hoặc Trưởng ca mới được duyệt", 403);
    }

    // Editing fields: ADMIN/SUPERVISOR any, TECHNICIAN only own, VIEWER none.
    const canEdit =
      user.role === "ADMIN" ||
      user.role === "MANAGER" ||
      user.role === "SUPERVISOR" ||
      (user.role === "TECHNICIAN" && existing.createdById === user.id);
    if (!canEdit && !isApproving) return fail("Không đủ quyền chỉnh sửa", 403);

    const log = await prisma.repairLog.update({
      where: { id: params.id },
      data: isApproving
        ? { approvedById: user.id, status: body.status || existing.status }
        : {
            title: body.title ?? existing.title,
            description: body.description ?? existing.description,
            symptom: body.symptom ?? existing.symptom,
            cause: body.cause ?? existing.cause,
            action: body.action ?? existing.action,
            result: body.result ?? existing.result,
            status: body.status ?? existing.status,
            priority: body.priority ?? existing.priority,
            startedAt: body.startedAt ? new Date(body.startedAt) : existing.startedAt,
            completedAt: body.completedAt ? new Date(body.completedAt) : existing.completedAt,
            cost: body.cost != null ? Number(body.cost) : existing.cost,
            downtime: body.downtime != null ? Number(body.downtime) : existing.downtime,
          },
    });
    await audit(user.id, isApproving ? "APPROVE_REPAIR" : "UPDATE_REPAIR", "RepairLog", log.id, log.title);
    return ok(log);
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const existing = await prisma.repairLog.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Không tìm thấy phiếu sửa chữa", 404);
    await assertSeqEditable(user, existing.deviceSeq);
    // Only ADMIN or the creator may delete.
    if (user.role !== "ADMIN" && existing.createdById !== user.id) {
      return fail("Chỉ Quản trị hoặc người tạo mới được xoá", 403);
    }
    await prisma.repairLog.delete({ where: { id: params.id } });
    await audit(user.id, "DELETE_REPAIR", "RepairLog", params.id, existing.title);
    return ok({ id: params.id });
  });
}
