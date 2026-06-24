import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import type { Prisma } from "@prisma/client";
import { EQUIPMENT_DEVICE_SELECT, withDeviceAlias } from "@/lib/equipment-device";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const sp = req.nextUrl.searchParams;
    const deviceId = sp.get("deviceId");
    const status = sp.get("status");
    const priority = sp.get("priority");
    const technicianId = sp.get("technicianId");
    const from = sp.get("from");
    const to = sp.get("to");

    const where: Prisma.RepairLogWhereInput = {};
    if (deviceId) where.deviceSeq = deviceId;
    if (status && status !== "ALL") where.status = status as any;
    if (priority && priority !== "ALL") where.priority = priority as any;
    if (technicianId && technicianId !== "ALL") where.createdById = technicianId;
    if (from || to) {
      where.startedAt = {};
      if (from) where.startedAt.gte = new Date(from);
      if (to) where.startedAt.lte = new Date(to + "T23:59:59");
    }

    const logs = await prisma.repairLog.findMany({
      where,
      orderBy: { startedAt: "desc" },
      include: {
        device: { select: EQUIPMENT_DEVICE_SELECT },
        createdBy: { select: { id: true, name: true, position: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    });
    return ok(logs.map(withDeviceAlias), { total: logs.length });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR", "TECHNICIAN"]);
    const body = await req.json();
    if (!body.deviceId || !body.title || !body.action) {
      return fail("Thiếu thông tin bắt buộc (thiết bị, tiêu đề, hành động)");
    }
    const log = await prisma.repairLog.create({
      data: {
        deviceSeq: body.deviceId,
        title: body.title,
        description: body.description || "",
        symptom: body.symptom || null,
        cause: body.cause || null,
        action: body.action,
        result: body.result || null,
        startedAt: body.startedAt ? new Date(body.startedAt) : new Date(),
        completedAt: body.completedAt ? new Date(body.completedAt) : null,
        status: body.status || "OPEN",
        priority: body.priority || "MEDIUM",
        cost: body.cost != null ? Number(body.cost) : null,
        downtime: body.downtime != null ? Number(body.downtime) : null,
        createdById: user.id,
        attachments: body.attachments || [],
      },
    });
    await audit(user.id, "CREATE_REPAIR", "RepairLog", log.id, log.title);
    return ok(log);
  });
}
