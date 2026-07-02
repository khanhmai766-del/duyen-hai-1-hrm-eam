import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { EQUIPMENT_DEVICE_SELECT, equipmentNodeToDevice } from "@/lib/equipment-device";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { normalizeText } from "@/lib/nav";
import { publicUserRef } from "@/lib/s3";

export const dynamic = "force-dynamic";

// Tầng 4: bảng lịch sử phình theo năm tháng — GET luôn có trần, không findMany không giới hạn.
const HISTORY_TAKE = 300;

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const access = await resolveEquipmentAccessForUser(user);
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
      take: HISTORY_TAKE,
      include: {
        // Tầng 4: avatar đi qua publicUserRef (proxy theo key) — không chở base64.
        doneBy: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true } },
        replacement: {
          select: {
            deviceSeq: true,
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
    const visibleLogs = access.hasExplicitScopes
      ? logs.filter((log) => {
          const replacement = log.replacement;
          if (!replacement) return false;
          if (replacement.deviceSeq) return access.canViewSeq(replacement.deviceSeq);
          if (replacement.system) return access.visibleSystemNames.has(normalizeText(replacement.system));
          return false;
        })
      : logs;

    return ok(
      visibleLogs.map((log: any) => ({
        ...log,
        doneBy: publicUserRef(log.doneBy),
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
      { total: visibleLogs.length, capped: logs.length === HISTORY_TAKE }
    );
  });
}
