import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { assertSeqEditable, resolveEquipmentAccessForUser } from "@/lib/server-access";
import { EQUIPMENT_DEVICE_SELECT, equipmentNodeToDevice } from "@/lib/equipment-device";
import { normalizeText } from "@/lib/nav";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { parseDateInput } from "@/lib/utils";

const DETAIL_INCLUDE = {
  material: { select: { id: true, code: true, name: true, unit: true, imageUrl: true } },
  device: { select: EQUIPMENT_DEVICE_SELECT },
  logs: {
    orderBy: { replacedAt: "desc" },
    include: { doneBy: { select: { id: true, name: true, position: true, avatarUrl: true } } },
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
    const viewable = point.deviceSeq
      ? access.canViewSeq(point.deviceSeq)
      : point.system
        ? access.visibleSystemNames.has(normalizeText(point.system))
        : !access.hasExplicitScopes;
    if (!viewable) return fail("Cương vị của bạn không có quyền xem điểm thay thế này", 403);
    return ok(mapPoint(point));
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "replacement-manage", ["manage", "full"], "Không đủ quyền cập nhật điểm thay thế");
    const body = await req.json();
    const existing = await prisma.materialReplacement.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Không tìm thấy điểm thay thế", 404);
    const access = await resolveEquipmentAccessForUser(user);
    if (
      access.hasExplicitScopes &&
      !access.canEditDeviceLike({ device: existing.deviceSeq, system: existing.system })
    ) {
      return fail("Cương vị của bạn không có quyền thao tác trên điểm thay thế này", 403);
    }
    if (body.deviceId) await assertSeqEditable(user, String(body.deviceId));

    const intervalMonths = body.intervalMonths != null ? Number(body.intervalMonths) : undefined;
    if (intervalMonths != null && (!Number.isFinite(intervalMonths) || intervalMonths < 0)) {
      return fail("Chu kỳ phải là số tháng hợp lệ (>= 0; 0 = không theo dõi lịch)");
    }
    if (body.deviceId !== undefined && !body.deviceId) return fail("Chọn thiết bị");

    const point = await prisma.materialReplacement.update({
      where: { id: params.id },
      data: {
        deviceSeq: body.deviceId !== undefined ? body.deviceId : undefined,
        location: body.deviceId !== undefined ? null : undefined,
        system: body.system !== undefined ? body.system?.trim() || null : undefined,
        intervalMonths,
        intervalNote: body.intervalNote !== undefined ? body.intervalNote?.trim() || null : undefined,
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
    await requirePermissionLevel(user, "replacement-manage", ["full"], "Không đủ quyền xoá điểm thay thế");
    const existing = await prisma.materialReplacement.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Không tìm thấy điểm thay thế", 404);
    const access = await resolveEquipmentAccessForUser(user);
    if (
      access.hasExplicitScopes &&
      !access.canEditDeviceLike({ device: existing.deviceSeq, system: existing.system })
    ) {
      return fail("Cương vị của bạn không có quyền thao tác trên điểm thay thế này", 403);
    }
    await prisma.materialReplacement.delete({ where: { id: params.id } });
    await audit(user.id, "DELETE_REPLACEMENT", "MaterialReplacement", params.id, auditDetailWithPosition(user));
    return ok({ id: params.id });
  });
}
