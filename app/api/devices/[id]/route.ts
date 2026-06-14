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
    const current = await prisma.device.findUnique({
      where: { id: params.id },
      select: { id: true, code: true },
    });
    if (!current) return fail("Không tìm thấy thiết bị", 404);

    const nextCode = typeof body.code === "string" ? body.code.trim() : undefined;
    if (body.code !== undefined && !nextCode) return fail("Mã thiết bị không được để trống");
    const codeChanged = !!nextCode && nextCode !== current.code;
    if (codeChanged && user.role !== "ADMIN") {
      return fail("Chỉ Quản trị viên được chỉnh sửa mã thiết bị", 403);
    }
    if (codeChanged) {
      const exists = await prisma.device.findUnique({ where: { code: nextCode } });
      if (exists && exists.id !== params.id) return fail("Mã thiết bị đã tồn tại");
    }
    const images = Array.isArray(body.images) ? body.images.filter(Boolean).slice(0, 3) : undefined;
    const device = await prisma.device.update({
      where: { id: params.id },
      data: {
        ...(codeChanged ? { code: nextCode } : {}),
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
