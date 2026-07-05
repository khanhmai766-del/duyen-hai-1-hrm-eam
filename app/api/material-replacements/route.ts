import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { replacementDueStatus } from "@/lib/constants";
import { EQUIPMENT_DEVICE_SELECT, equipmentNodeToDevice } from "@/lib/equipment-device";
import { normalizeText } from "@/lib/nav";

export const dynamic = "force-dynamic";

const INCLUDE = {
  material: {
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      imageUrl: true,
      system: true,
      deviceMaterials: {
        select: { id: true, deviceSeq: true, materialId: true, quantity: true, usedAt: true, note: true, device: { select: EQUIPMENT_DEVICE_SELECT } },
        orderBy: { usedAt: "desc" },
      },
    },
  },
  device: { select: EQUIPMENT_DEVICE_SELECT },
  _count: { select: { logs: true } },
} satisfies Prisma.MaterialReplacementInclude;

function mapPoint(point: any) {
  return {
    ...point,
    deviceId: point.deviceSeq ?? null,
    device: equipmentNodeToDevice(point.device),
    material: point.material
      ? {
          ...point.material,
          deviceMaterials: point.material.deviceMaterials?.map((dm: any) => ({
            ...dm,
            deviceId: dm.deviceSeq,
            device: equipmentNodeToDevice(dm.device),
          })),
        }
      : point.material,
  };
}
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const access = await resolveEquipmentAccessForUser(user);
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim();
    const materialId = sp.get("materialId");
    const due = sp.get("due");

    const where: Prisma.MaterialReplacementWhereInput = { isActive: true };
    if (materialId) where.materialId = materialId;
    if (q) {
      where.OR = [
        { material: { is: { name: { contains: q, mode: "insensitive" } } } },
        { material: { is: { code: { contains: q, mode: "insensitive" } } } },
        { material: { is: { deviceMaterials: { some: { device: { is: { seq: { contains: q, mode: "insensitive" } } } } } } } },
        { material: { is: { deviceMaterials: { some: { device: { is: { name: { contains: q, mode: "insensitive" } } } } } } } },
        { device: { is: { seq: { contains: q, mode: "insensitive" } } } },
        { device: { is: { name: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const points = await prisma.materialReplacement.findMany({
      where,
      orderBy: { nextDueAt: "asc" },
      include: INCLUDE,
    });
    const visiblePoints = access.hasExplicitScopes
      ? points.filter((point) => {
          if (point.deviceSeq) return access.canViewSeq(point.deviceSeq);
          if (point.system) return access.visibleSystemNames.has(normalizeText(point.system));
          return false;
        })
      : points;

    const counts = { OVERDUE: 0, DUE_SOON: 0, OK: 0 };
    for (const p of visiblePoints) counts[replacementDueStatus(p.nextDueAt)]++;

    let filtered = visiblePoints;
    if (due && due !== "ALL") {
      if (due === "WARN") filtered = visiblePoints.filter((p) => replacementDueStatus(p.nextDueAt) !== "OK");
      else filtered = visiblePoints.filter((p) => replacementDueStatus(p.nextDueAt) === due);
    }

    return ok(filtered.map(mapPoint), { total: filtered.length, counts, warn: counts.OVERDUE + counts.DUE_SOON });
  });
}
