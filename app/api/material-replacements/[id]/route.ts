import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireUser();
    const point = await prisma.materialReplacement.findUnique({
      where: { id: params.id },
      include: {
        material: { select: { id: true, code: true, name: true, unit: true, imageUrl: true } },
        device: { select: { id: true, code: true, name: true, location: true } },
        logs: {
          orderBy: { replacedAt: "desc" },
          include: { doneBy: { select: { id: true, name: true, position: true } } },
        },
      },
    });
    if (!point) return fail("Không tìm thấy điểm thay thế", 404);
    return ok(point);
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR"]);
    const body = await req.json();

    const intervalMonths = body.intervalMonths != null ? Number(body.intervalMonths) : undefined;
    if (intervalMonths != null && (!Number.isFinite(intervalMonths) || intervalMonths < 1)) {
      return fail("Chu kỳ phải là số tháng hợp lệ (≥ 1)");
    }
    if (body.deviceId !== undefined && !body.deviceId && !body.location?.trim()) {
      return fail("Chọn thiết bị hoặc nhập vị trí thay thế");
    }

    const point = await prisma.materialReplacement.update({
      where: { id: params.id },
      data: {
        deviceId: body.deviceId !== undefined ? body.deviceId || null : undefined,
        location: body.location !== undefined ? body.location?.trim() || null : undefined,
        system: body.system !== undefined ? body.system?.trim() || null : undefined,
        intervalMonths,
        intervalNote: body.intervalNote !== undefined ? body.intervalNote?.trim() || null : undefined,
        lastReplacedAt: body.lastReplacedAt ? new Date(body.lastReplacedAt) : undefined,
        nextDueAt: body.nextDueAt ? new Date(body.nextDueAt) : undefined,
        note: body.note !== undefined ? body.note?.trim() || null : undefined,
        isActive: body.isActive,
      },
      include: {
        material: { select: { id: true, code: true, name: true, unit: true, imageUrl: true } },
        device: { select: { id: true, code: true, name: true, location: true } },
        _count: { select: { logs: true } },
      },
    });
    await audit(user.id, "UPDATE_REPLACEMENT", "MaterialReplacement", point.id);
    return ok(point);
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
