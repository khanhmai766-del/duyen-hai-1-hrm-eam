import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim();
    const status = sp.get("status");
    const category = sp.get("category");

    const where: Prisma.DeviceWhereInput = {};
    if (status && status !== "ALL") where.status = status as any;
    if (category && category !== "ALL") where.category = category;
    if (q) {
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { location: { contains: q, mode: "insensitive" } },
        { serialNumber: { contains: q, mode: "insensitive" } },
      ];
    }

    const devices = await prisma.device.findMany({
      where,
      orderBy: { code: "asc" },
      include: {
        repairLogs: { orderBy: { startedAt: "desc" }, take: 1 },
        _count: { select: { repairLogs: true } },
      },
    });

    // status counts for filter chips (ignores status filter, respects search/category)
    const countWhere: Prisma.DeviceWhereInput = { ...where };
    delete countWhere.status;
    const grouped = await prisma.device.groupBy({
      by: ["status"],
      where: countWhere,
      _count: true,
    });
    const counts = grouped.reduce<Record<string, number>>((acc, g) => {
      acc[g.status] = g._count;
      return acc;
    }, {});

    return ok(devices, { total: devices.length, counts });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR", "TECHNICIAN"]);
    const body = await req.json();
    if (!body.code || !body.name || !body.category || !body.location) {
      return fail("Thiếu thông tin bắt buộc (mã, tên, loại, vị trí)");
    }
    const exists = await prisma.device.findUnique({ where: { code: body.code } });
    if (exists) return fail("Mã thiết bị đã tồn tại");

    const device = await prisma.device.create({
      data: {
        code: body.code,
        name: body.name,
        category: body.category,
        location: body.location,
        manufacturer: body.manufacturer || null,
        model: body.model || null,
        serialNumber: body.serialNumber || null,
        status: body.status || "NORMAL",
        installDate: body.installDate ? new Date(body.installDate) : null,
        warrantyUntil: body.warrantyUntil ? new Date(body.warrantyUntil) : null,
        imageUrl: body.imageUrl || null,
        specs: body.specs ?? undefined,
      },
    });
    await prisma.device.update({
      where: { id: device.id },
      data: { qrCodeData: `${process.env.NEXT_PUBLIC_APP_URL || ""}/devices/${device.id}` },
    });
    await audit(user.id, "CREATE_DEVICE", "Device", device.id, device.code);
    return ok(device);
  });
}
