import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireRole, requireUser } from "@/lib/api";
import { EQUIPMENT_DEVICE_SELECT, equipmentNodeToDevice } from "@/lib/equipment-device";

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
    await requireUser();
    const point = await prisma.materialReplacement.findUnique({
      where: { id: params.id },
      include: DETAIL_INCLUDE,
    });
    if (!point) return fail("Không tìm thấy điểm thay thế", 404);
    return ok(mapPoint(point));
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR"]);
    const body = await req.json();

    const intervalMonths = body.intervalMonths != null ? Number(body.intervalMonths) : undefined;
    if (intervalMonths != null && (!Number.isFinite(intervalMonths) || intervalMonths < 1)) {
      return fail("Chu kỳ phải là số tháng hợp lệ (>= 1)");
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
        lastReplacedAt: body.lastReplacedAt ? new Date(body.lastReplacedAt) : undefined,
        nextDueAt: body.nextDueAt ? new Date(body.nextDueAt) : undefined,
        note: body.note !== undefined ? body.note?.trim() || null : undefined,
        isActive: body.isActive,
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
    await audit(user.id, "UPDATE_REPLACEMENT", "MaterialReplacement", point.id);
    return ok(mapPoint(point));
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR"]);
    await prisma.materialReplacement.delete({ where: { id: params.id } });
    await audit(user.id, "DELETE_REPLACEMENT", "MaterialReplacement", params.id);
    return ok({ id: params.id });
  });
}
