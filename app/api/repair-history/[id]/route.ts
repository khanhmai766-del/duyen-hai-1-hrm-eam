import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { assertSeqEditable, assertSeqViewable } from "@/lib/server-access";
import { EQUIPMENT_DEVICE_SELECT, withDeviceAlias } from "@/lib/equipment-device";
import { invalidateDeviceListCache } from "@/lib/device-list-cache";
import { assignedPermissionLevel } from "@/lib/rbac-permissions";
import { hasPermissionLevel } from "@/lib/rbac-guard";

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

    const isApproving = body.approve === true;
    if (isApproving && !(await hasPermissionLevel(user, "repair-approve", ["approve", "manage", "full"]))) {
      return fail("Chỉ Quản trị, Quản lý hoặc Trưởng ca mới được duyệt", 403);
    }

    const editLevel = await assignedPermissionLevel(user, "repair-edit");
    const canEdit = ["manage", "full"].includes(editLevel) || (editLevel === "own" && existing.createdById === user.id);
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
    invalidateDeviceListCache();
    return ok(log);
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const existing = await prisma.repairLog.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Không tìm thấy phiếu sửa chữa", 404);
    await assertSeqEditable(user, existing.deviceSeq);
    const deleteLevel = await assignedPermissionLevel(user, "repair-delete");
    if (!(deleteLevel === "full" || (["own", "manage"].includes(deleteLevel) && existing.createdById === user.id))) {
      return fail("Không đủ quyền xoá phiếu sửa chữa", 403);
    }
    await prisma.repairLog.delete({ where: { id: params.id } });
    await audit(user.id, "DELETE_REPAIR", "RepairLog", params.id, existing.title);
    invalidateDeviceListCache();
    return ok({ id: params.id });
  });
}
