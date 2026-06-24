import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { EQUIPMENT_DEVICE_SELECT, equipmentNodeToDevice } from "@/lib/equipment-device";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim();

    const where: Prisma.MaterialReplacementLogWhereInput = {};
    if (q) {
      where.OR = [
        { note: { contains: q, mode: "insensitive" } },
        { replacement: { is: { device: { is: { seq: { contains: q, mode: "insensitive" } } } } } },
        { replacement: { is: { device: { is: { name: { contains: q, mode: "insensitive" } } } } } },
        { replacement: { is: { material: { is: { deviceMaterials: { some: { device: { is: { seq: { contains: q, mode: "insensitive" } } } } } } } } } },
        { replacement: { is: { material: { is: { deviceMaterials: { some: { device: { is: { name: { contains: q, mode: "insensitive" } } } } } } } } } },
        { replacement: { is: { material: { is: { name: { contains: q, mode: "insensitive" } } } } } },
        { replacement: { is: { material: { is: { code: { contains: q, mode: "insensitive" } } } } } },
      ];
    }

    const logs = await prisma.materialReplacementLog.findMany({
      where,
      orderBy: { replacedAt: "desc" },
      include: {
        doneBy: { select: { id: true, name: true, position: true, avatarUrl: true } },
        replacement: {
          select: {
            system: true,
            intervalMonths: true,
            intervalNote: true,
            device: { select: EQUIPMENT_DEVICE_SELECT },
            material: {
              select: {
                id: true,
                code: true,
                name: true,
                unit: true,
                system: true,
                deviceMaterials: {
                  select: { device: { select: EQUIPMENT_DEVICE_SELECT } },
                  orderBy: { usedAt: "desc" },
                },
              },
            },
          },
        },
      },
    });

    return ok(
      logs.map((log: any) => ({
        ...log,
        replacement: log.replacement
          ? {
              ...log.replacement,
              device: equipmentNodeToDevice(log.replacement.device),
              material: {
                ...log.replacement.material,
                deviceMaterials: log.replacement.material.deviceMaterials?.map((dm: any) => ({
                  ...dm,
                  device: equipmentNodeToDevice(dm.device),
                })),
              },
            }
          : null,
      })),
      { total: logs.length }
    );
  });
}
