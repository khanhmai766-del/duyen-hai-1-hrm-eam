import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireUser();
    const device = await prisma.device.findUnique({
      where: { id: params.id },
      include: {
        repairLogs: {
          orderBy: { startedAt: "desc" },
          include: { createdBy: { select: { id: true, name: true, position: true } } },
        },
        materials: { include: { material: true }, orderBy: { usedAt: "desc" } },
      },
    });
    if (!device) return fail("Không tìm thấy thiết bị", 404);
    return ok(device);
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR", "TECHNICIAN"]);
    const body = await req.json();
    const images = Array.isArray(body.images) ? body.images.filter(Boolean).slice(0, 3) : undefined;
    const device = await prisma.device.update({
      where: { id: params.id },
      data: {
        name: body.name,
        system: body.system !== undefined ? body.system?.trim() || null : undefined,
        managingPosition: body.managingPosition !== undefined ? body.managingPosition?.trim() || null : undefined,
        images,
        attachedInfo: body.attachedInfo !== undefined ? body.attachedInfo?.trim() || null : undefined,
        documentUrl: body.documentUrl !== undefined ? body.documentUrl?.trim() || null : undefined,
      },
    });
    await audit(user.id, "UPDATE_DEVICE", "Device", device.id, device.code);
    return ok(device);
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]); // only ADMIN can delete devices
    await prisma.device.delete({ where: { id: params.id } });
    await audit(user.id, "DELETE_DEVICE", "Device", params.id);
    return ok({ id: params.id });
  });
}
