import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { assertSeqEditable, resolveEquipmentAccessForUser } from "@/lib/server-access";
import { publicUserRef } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { parseDateInput } from "@/lib/utils";
import { normalizeMappedUnit, validateMappedDevice } from "@/lib/defect-device-mapping";

// Tầng 4: avatar trong payload đi qua publicUserRef (proxy theo key) — không chở base64.
const INCLUDE = {
  createdBy: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true } },
  relatedDevices: {
    select: { deviceSeq: true, mappedUnit: true, device: { select: { seq: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-manage", ["manage", "full"], "Không đủ quyền cập nhật lịch sử khiếm khuyết");
    const body = await req.json();
    const existing = await prisma.defectHistory.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Không tìm thấy lịch sử khiếm khuyết", 404);
    if (existing.device) await assertSeqEditable(user, existing.device);
    if (body.device) await assertSeqEditable(user, String(body.device));

    // Đồng bộ khóa chuẩn deviceSeq khi client gửi trường device (chỉ gán seq có thật).
    const deviceSeq =
      body.device !== undefined
        ? body.device?.trim()
          ? (await prisma.equipmentNode.findUnique({ where: { seq: body.device.trim() }, select: { seq: true } }))?.seq ?? null
          : null
        : undefined;
    const nextDeviceSeq = deviceSeq === undefined ? existing.deviceSeq : deviceSeq;
    const nextUnit = body.unit !== undefined ? body.unit : existing.unit;
    const mappedDeviceUnit = normalizeMappedUnit(
      body.mappedDeviceUnit ?? existing.mappedDeviceUnit,
      nextUnit,
      nextDeviceSeq
    );
    if (nextDeviceSeq && (body.device !== undefined || body.unit !== undefined || body.mappedDeviceUnit !== undefined)) {
      const mappingError = validateMappedDevice(nextDeviceSeq, mappedDeviceUnit, nextUnit);
      if (mappingError) return fail(mappingError);
    }

    const history = await prisma.defectHistory.update({
      where: { id: params.id },
      data: {
        unit: body.unit !== undefined ? body.unit : undefined,
        device: body.device !== undefined ? body.device?.trim() || null : undefined,
        deviceSeq,
        mappedDeviceUnit:
          body.device !== undefined || body.unit !== undefined || body.mappedDeviceUnit !== undefined
            ? mappedDeviceUnit
            : undefined,
        system: body.system !== undefined ? body.system?.trim() || null : undefined,
        requestType: body.requestType !== undefined ? body.requestType?.trim() || null : undefined,
        workOrderNumber: body.workOrderNumber !== undefined ? body.workOrderNumber?.trim() || null : undefined,
        performedAt: body.performedAt !== undefined ? (body.performedAt ? parseDateInput(body.performedAt) : undefined) : undefined,
        result: body.result !== undefined ? body.result?.trim() || null : undefined,
        defectContent: body.defectContent !== undefined ? body.defectContent?.trim() || null : undefined,
        content: body.content !== undefined ? body.content?.trim() || null : undefined,
        requestNumber: body.requestNumber !== undefined ? body.requestNumber?.trim() || null : undefined,
      },
      include: INCLUDE,
    });
    await audit(user.id, "UPDATE_DEFECT_HISTORY", "DefectHistory", history.id, auditDetailWithPosition(user));
    return ok({ ...history, createdBy: publicUserRef(history.createdBy) });
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-history-delete", ["full"], "Không đủ quyền xoá lịch sử khiếm khuyết");
    const existing = await prisma.defectHistory.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Không tìm thấy lịch sử khiếm khuyết", 404);
    const access = await resolveEquipmentAccessForUser(user);
    if (access.hasExplicitScopes && !access.canEditDeviceLike({ device: existing.device, system: existing.system })) {
      return fail("Cương vị của bạn không có quyền thao tác trên lịch sử khiếm khuyết này", 403);
    }
    await prisma.defectHistory.delete({ where: { id: params.id } });
    await audit(user.id, "DELETE_DEFECT_HISTORY", "DefectHistory", params.id, auditDetailWithPosition(user));
    return ok({ id: params.id });
  });
}
