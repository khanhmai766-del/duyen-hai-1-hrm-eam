import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireRole, requireUser } from "@/lib/api";
import { assertSeqEditable, resolveEquipmentAccessForUser } from "@/lib/server-access";
import { addMonths, replacementDueStatus } from "@/lib/constants";
import { EQUIPMENT_DEVICE_SELECT, equipmentNodeToDevice } from "@/lib/equipment-device";
import { normalizeText } from "@/lib/nav";

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

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR"]);
    const body = await req.json();

    if (!body.materialId || !body.intervalMonths) return fail("Thiếu thông tin bắt buộc (vật tư, chu kỳ)");
    if (!body.deviceId) return fail("Chọn thiết bị");
    await assertSeqEditable(user, String(body.deviceId));
    const intervalMonths = Number(body.intervalMonths);
    if (!Number.isFinite(intervalMonths) || intervalMonths < 1) return fail("Chu kỳ phải là số tháng hợp lệ (>= 1)");

    const material = await prisma.material.findUnique({ where: { id: body.materialId } });
    if (!material) return fail("Không tìm thấy vật tư", 404);

    const base = body.lastReplacedAt ? new Date(body.lastReplacedAt) : new Date();
    const nextDueAt = body.nextDueAt ? new Date(body.nextDueAt) : addMonths(base, intervalMonths);

    const point = await prisma.materialReplacement.create({
      data: {
        materialId: body.materialId,
        deviceSeq: body.deviceId,
        location: null,
        system: body.system?.trim() || material.system || null,
        intervalMonths,
        intervalNote: body.intervalNote?.trim() || null,
        lastReplacedAt: body.lastReplacedAt ? new Date(body.lastReplacedAt) : null,
        nextDueAt,
        note: body.note?.trim() || null,
        createdById: user.id,
      },
      include: INCLUDE,
    });
    const linked = await prisma.equipmentMaterial.findFirst({
      where: { materialId: body.materialId, deviceSeq: body.deviceId },
      select: { id: true },
    });
    if (!linked) {
      await prisma.equipmentMaterial.create({
        data: { materialId: body.materialId, deviceSeq: body.deviceId, quantity: 1 },
      });
    }
    await audit(user.id, "CREATE_REPLACEMENT", "MaterialReplacement", point.id, material.code);
    return ok(mapPoint(point));
  });
}
