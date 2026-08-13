import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import {
  managingPositionsForEquipmentSeq,
  resolveEquipmentAccessForUser,
} from "@/lib/server-access";
import { getCachedEquipmentNodeFull } from "@/lib/equipment-node-cache";
import { assertSeqsInScope } from "@/lib/equipment-tree-scope";
import { EQUIPMENT_DEVICE_SELECT, equipmentNodeToDevice } from "@/lib/equipment-device";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { parseDateInput } from "@/lib/utils";
import { publicUserRef } from "@/lib/s3";
import { positionCodeOf, positionsMatch } from "@/lib/position-catalog";
import {
  canEditMaterialReplacement,
  canViewMaterialReplacement,
} from "@/lib/material-replacement-access";
import { resolvePositionViewScope } from "@/lib/position-data-scope";

const DETAIL_INCLUDE = {
  material: { select: { id: true, code: true, name: true, unit: true, imageUrl: true } },
  device: { select: EQUIPMENT_DEVICE_SELECT },
  logs: {
    orderBy: { replacedAt: "desc" },
    include: { doneBy: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true } } },
  },
} as const;

const SUMMARY_INCLUDE = {
  material: { select: { id: true, code: true, name: true, unit: true, imageUrl: true } },
  device: { select: EQUIPMENT_DEVICE_SELECT },
  _count: { select: { logs: true } },
} as const;

function mapPoint(point: any) {
  return {
    ...point,
    deviceId: point.deviceSeq ?? null,
    device: equipmentNodeToDevice(point.device),
    logs: point.logs?.map((log: any) => ({
      ...log,
      doneBy: log.doneBy ? publicUserRef(log.doneBy) : null,
    })),
  };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const point = await prisma.materialReplacement.findUnique({
      where: { id: params.id },
      include: DETAIL_INCLUDE,
    });
    if (!point) return fail("Không tìm thấy điểm thay thế", 404);
    const access = await resolveEquipmentAccessForUser(user);
    const viewScope = await resolvePositionViewScope(user, "replacement");
    if (!canViewMaterialReplacement(access, point, viewScope)) {
      return fail("Cương vị của bạn không có quyền xem điểm thay thế này", 403);
    }
    return ok(mapPoint(point));
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "replacement-manage", ["manage", "full"], "Không đủ quyền cập nhật điểm thay thế");
    const body = await req.json();
    const existing = await prisma.materialReplacement.findUnique({
      where: { id: params.id },
      include: { _count: { select: { logs: true, defectRequests: true } } },
    });
    if (!existing) return fail("Không tìm thấy điểm thay thế", 404);
    const access = await resolveEquipmentAccessForUser(user);
    if (!canEditMaterialReplacement(access, existing)) {
      return fail("Cương vị của bạn không có quyền cập nhật điểm thay thế này", 403);
    }
    // Đổi thiết bị của một điểm cũng phải nằm trong đúng cây của tổ máy sở hữu điểm.
    if (body.deviceId) assertSeqsInScope([String(body.deviceId)], existing.machine);

    const intervalMonths = body.intervalMonths != null ? Number(body.intervalMonths) : undefined;
    if (intervalMonths != null && (!Number.isFinite(intervalMonths) || intervalMonths < 0)) {
      return fail("Chu kỳ phải là số tháng hợp lệ (>= 0; 0 = không theo dõi lịch)");
    }
    if (body.deviceId !== undefined && !body.deviceId) return fail("Chọn thiết bị");
    const targetMaterialId = body.materialId !== undefined
      ? String(body.materialId ?? "").trim()
      : existing.materialId;
    if (!targetMaterialId) return fail("Vui lòng chọn vật tư");
    if (targetMaterialId !== existing.materialId) {
      if (existing.isActive) return fail("Không thể đổi vật tư của điểm đang theo dõi");
      if (existing._count.logs > 0 || existing._count.defectRequests > 0) {
        return fail("Không thể đổi vật tư vì khai báo đã phát sinh số yêu cầu hoặc lịch sử thay thế");
      }
      const [targetMaterial, duplicate, activeTracking] = await Promise.all([
        prisma.material.findUnique({ where: { id: targetMaterialId }, select: { machine: true } }),
        prisma.materialReplacement.findFirst({
          where: {
            id: { not: existing.id },
            materialId: targetMaterialId,
            deviceSeq: existing.deviceSeq,
            machine: existing.machine,
            isActive: false,
          },
          select: { id: true },
        }),
        prisma.materialReplacement.findFirst({
          where: {
            materialId: existing.materialId,
            deviceSeq: existing.deviceSeq,
            machine: existing.machine,
            isActive: true,
          },
          select: { id: true },
        }),
      ]);
      if (!targetMaterial || targetMaterial.machine !== existing.machine) {
        return fail("Vật tư không thuộc đúng tổ máy của khai báo", 400);
      }
      if (duplicate) return fail("Vật tư này đã được khai báo cho thiết bị");
      if (activeTracking) {
        return fail("Khai báo đang có điểm theo dõi; hãy kết thúc hoặc gỡ điểm theo dõi trước khi đổi vật tư");
      }
    }
    const quantity = body.quantity !== undefined ? Math.round(Number(body.quantity)) : undefined;
    if (quantity !== undefined && (!Number.isFinite(quantity) || quantity <= 0)) {
      return fail("Dung tích hoặc số lượng phải lớn hơn 0");
    }
    const deviceCount = body.deviceCount !== undefined ? Math.round(Number(body.deviceCount)) : undefined;
    if (deviceCount !== undefined && (!Number.isFinite(deviceCount) || deviceCount <= 0)) {
      return fail("Số lượng thiết bị phải lớn hơn 0");
    }
    const targetDeviceSeq =
      body.deviceId !== undefined ? String(body.deviceId).trim() : existing.deviceSeq;
    const targetSystem =
      body.system !== undefined ? String(body.system ?? "").trim() || null : existing.system;
    if (!canEditMaterialReplacement(access, { deviceSeq: targetDeviceSeq, system: targetSystem })) {
      return fail("Cương vị của bạn không có quyền chuyển điểm thay thế sang thiết bị/hệ thống này", 403);
    }
    let managingPosition =
      body.managingPosition !== undefined
        ? String(body.managingPosition ?? "").trim() || null
        : existing.managingPosition;
    if (targetDeviceSeq) {
      const nodes = await getCachedEquipmentNodeFull();
      const positions = await managingPositionsForEquipmentSeq(targetDeviceSeq, nodes);
      if (!positions.length) {
        return fail("Thiết bị chưa được phân cương vị quản lý trên cây thiết bị");
      }
      const matched = positions.find((position) => positionsMatch(position, managingPosition));
      if (body.managingPosition !== undefined && managingPosition && !matched) {
        return fail("Cương vị không còn được phân quyền quản lý thiết bị đã chọn");
      }
      managingPosition = matched ?? positions[0];
    }

    const point = await prisma.materialReplacement.update({
      where: { id: params.id },
      data: {
        materialId: body.materialId !== undefined ? targetMaterialId : undefined,
        deviceSeq: body.deviceId !== undefined ? body.deviceId : undefined,
        location: body.location !== undefined
          ? String(body.location ?? "").trim() || null
          : body.deviceId !== undefined ? null : undefined,
        system: body.system !== undefined ? body.system?.trim() || null : undefined,
        quantity,
        deviceCount,
        managingPosition,
        managingPositionCode: positionCodeOf(managingPosition),
        intervalMonths,
        intervalNote: body.intervalNote !== undefined ? body.intervalNote?.trim() || null : undefined,
        // Cho phép đổi nhóm sau khi tạo: điểm khai báo nhầm là thay thế định kỳ
        // có thể chuyển sang chỉ lấy mẫu mà không phải xoá rồi tạo lại.
        samplingOnly: body.samplingOnly !== undefined ? body.samplingOnly === true : undefined,
        lastReplacedAt: body.lastReplacedAt ? parseDateInput(body.lastReplacedAt) : undefined,
        nextDueAt: body.nextDueAt ? parseDateInput(body.nextDueAt) : undefined,
        note: body.note !== undefined ? body.note?.trim() || null : undefined,
        isActive: intervalMonths === 0 ? false : body.isActive,
      },
      include: SUMMARY_INCLUDE,
    });
    if (body.deviceId) {
      const linked = await prisma.equipmentMaterial.findFirst({
        where: { materialId: point.materialId, deviceSeq: body.deviceId },
        select: { id: true },
      });
      if (!linked) {
        await prisma.equipmentMaterial.create({
          data: { materialId: point.materialId, deviceSeq: body.deviceId, quantity: 1 },
        });
      }
    }
    await audit(user.id, "UPDATE_REPLACEMENT", "MaterialReplacement", point.id, auditDetailWithPosition(user));
    return ok(mapPoint(point));
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "replacement-manage", ["manage", "full"], "Không đủ quyền xoá điểm thay thế");
    const existing = await prisma.materialReplacement.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Không tìm thấy điểm thay thế", 404);
    const access = await resolveEquipmentAccessForUser(user);
    if (!canEditMaterialReplacement(access, existing)) {
      return fail("Cương vị của bạn không có quyền xoá điểm thay thế này", 403);
    }
    await prisma.materialReplacement.delete({ where: { id: params.id } });
    await audit(user.id, "DELETE_REPLACEMENT", "MaterialReplacement", params.id, auditDetailWithPosition(user));
    return ok({ id: params.id });
  });
}
