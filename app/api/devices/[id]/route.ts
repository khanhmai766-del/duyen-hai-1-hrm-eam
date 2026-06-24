import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { syncDeviceEquipmentNode } from "@/lib/equipment-node-sync";

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
    const systemSeq = typeof body.systemSeq === "string" ? body.systemSeq.trim() : null;
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
    await syncDeviceEquipmentNode(prisma, {
      seq: device.code,
      previousSeq: current.code,
      parentSeq: systemSeq,
      name: device.name,
    });
    await audit(user.id, "UPDATE_DEVICE", "Device", device.id, device.code);
    return ok(device);
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]); // only ADMIN can delete devices
    const device = await prisma.device.findUnique({ where: { id: params.id }, select: { code: true } });
    await prisma.device.delete({ where: { id: params.id } });
    // Xóa kèm node trên cây thiết bị nếu node này do đồng bộ khi tạo thiết bị sinh ra
    // (deviceSynced) và là node lá (không có con) — không đụng node danh mục nhập từ Excel.
    if (device) {
      const node = await prisma.equipmentNode.findUnique({
        where: { seq: device.code },
        select: { id: true, seq: true, deviceSynced: true },
      });
      if (node?.deviceSynced) {
        const childCount = await prisma.equipmentNode.count({ where: { parentSeq: node.seq } });
        if (childCount === 0) await prisma.equipmentNode.delete({ where: { id: node.id } });
      }
    }
    await audit(user.id, "DELETE_DEVICE", "Device", params.id);
    return ok({ id: params.id });
  });
}
