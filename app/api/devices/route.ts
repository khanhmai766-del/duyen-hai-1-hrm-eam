import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim();
    const system = sp.get("system");

    const where: Prisma.DeviceWhereInput = {};
    if (system && system !== "ALL") where.system = system;
    if (q) {
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { system: { contains: q, mode: "insensitive" } },
        { managingPosition: { contains: q, mode: "insensitive" } },
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

    // Danh sách "Hệ thống" phân biệt (bỏ qua bộ lọc system) cho dropdown lọc.
    const grouped = await prisma.device.groupBy({
      by: ["system"],
      where: q ? { OR: where.OR } : {},
    });
    const systems = grouped
      .map((g) => g.system)
      .filter((s): s is string => !!s)
      .sort((a, b) => a.localeCompare(b, "vi"));

    return ok(devices, { total: devices.length, systems });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]); // chỉ Quản trị viên được thêm thiết bị
    const body = await req.json();
    if (!body.code || !body.name) {
      return fail("Thiếu thông tin bắt buộc (mã, tên thiết bị)");
    }
    const exists = await prisma.device.findUnique({ where: { code: body.code } });
    if (exists) return fail("Mã thiết bị đã tồn tại");

    const images = Array.isArray(body.images) ? body.images.filter(Boolean).slice(0, 3) : [];
    const device = await prisma.device.create({
      data: {
        code: body.code,
        name: body.name,
        system: body.system?.trim() || null,
        managingPosition: body.managingPosition?.trim() || null,
        images,
        attachedInfo: body.attachedInfo?.trim() || null,
        documentUrl: body.documentUrl?.trim() || null,
      },
    });
    await prisma.device.update({
      where: { id: device.id },
      data: { qrCodeData: `${process.env.NEXT_PUBLIC_APP_URL || ""}/public/devices/${device.id}` },
    });
    await audit(user.id, "CREATE_DEVICE", "Device", device.id, device.code);
    return ok(device);
  });
}
