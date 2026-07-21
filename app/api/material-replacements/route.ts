import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { replacementDueStatus } from "@/lib/constants";
import { EQUIPMENT_DEVICE_SELECT, equipmentNodeToDevice } from "@/lib/equipment-device";
import { normalizeText } from "@/lib/nav";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { parseDateInput } from "@/lib/utils";

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
      machine: true,
      category: true,
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

    // Chu kỳ 0 chỉ dùng để khai báo liên kết vật tư - thiết bị, không xuất hiện
    // trong lịch hoặc cảnh báo thay thế.
    const where: Prisma.MaterialReplacementWhereInput = { isActive: true, intervalMonths: { gt: 0 } };
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

// POST /api/material-replacements — tạo MỘT ĐIỂM THEO DÕI thời gian thay thế (isActive=true).
// Điểm này là bản ghi riêng, tách khỏi dòng khai báo thiết bị trong Danh mục vật tư
// (dòng khai báo giữ isActive=false nên nút "Thêm điểm" luôn còn để tạo tiếp).
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "replacement-manage", ["create", "manage", "full"], "Không đủ quyền thêm điểm theo dõi");
    const body = await req.json();

    const materialId = String(body.materialId || "").trim();
    const material = await prisma.material.findUnique({ where: { id: materialId }, select: { id: true, code: true } });
    if (!material) return fail("Không tìm thấy vật tư", 404);

    const deviceSeq = String(body.deviceSeq ?? body.deviceId ?? "").trim() || null;
    const system = String(body.system ?? "").trim() || null;
    if (!deviceSeq && !system) return fail("Điểm theo dõi phải gắn với thiết bị hoặc hệ thống");

    const access = await resolveEquipmentAccessForUser(user);
    if (access.hasExplicitScopes && !access.canEditDeviceLike({ device: deviceSeq, system })) {
      return fail("Cương vị của bạn không có quyền thao tác trên hệ thống/thiết bị này", 403);
    }

    const parsedInterval = Math.round(Number(body.intervalMonths));
    const intervalMonths = Number.isFinite(parsedInterval) ? Math.max(0, parsedInterval) : 12;
    const lastReplacedAt = body.lastReplacedAt ? parseDateInput(body.lastReplacedAt) : new Date();
    let nextDueAt: Date;
    if (body.nextDueAt) {
      nextDueAt = parseDateInput(body.nextDueAt);
    } else {
      nextDueAt = new Date(lastReplacedAt);
      nextDueAt.setMonth(nextDueAt.getMonth() + intervalMonths);
    }

    const point = await prisma.materialReplacement.create({
      data: {
        materialId,
        deviceSeq,
        system,
        location: String(body.location ?? "").trim() || null,
        managingPosition: String(body.managingPosition ?? "").trim() || null,
        quantity: Math.max(0, Math.round(Number(body.quantity)) || 0),
        deviceCount: Math.max(1, Math.round(Number(body.deviceCount)) || 1),
        intervalMonths,
        intervalNote: String(body.intervalNote ?? "").trim() || null,
        lastReplacedAt,
        nextDueAt,
        note: String(body.note ?? "").trim() || null,
        isActive: intervalMonths > 0,
        createdById: user.id,
      },
      include: INCLUDE,
    });
    await audit(user.id, "CREATE_REPLACEMENT", "MaterialReplacement", point.id, material.code);
    return ok(mapPoint(point));
  });
}
