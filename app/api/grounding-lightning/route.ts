import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  audit,
  auditDetailWithPosition,
  fail,
  handle,
  ok,
  requireUser,
} from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  GROUNDING_PERMISSIONS,
  groundingScopeWithPermissions,
  isGroundingMachine,
  isGroundingType,
  serializeGroundingItem,
} from "@/lib/grounding-lightning";
import { isPositionCode, positionLabelOf } from "@/lib/position-catalog";

export const dynamic = "force-dynamic";

const includeItem = {
  points: {
    orderBy: { type: "asc" as const },
    include: { attachments: { orderBy: { createdAt: "asc" as const } } },
  },
  inspections: {
    orderBy: { signedAt: "desc" as const },
    take: 1,
    include: { results: { orderBy: { type: "asc" as const } } },
  },
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, GROUNDING_PERMISSIONS.view, [
      "read",
      "personal",
      "manage",
      "full",
    ]);
    const sp = req.nextUrl.searchParams;
    const scope = await groundingScopeWithPermissions(user);
    const q = sp.get("q")?.trim();
    const positionCode = sp.get("positionCode");
    const machine = sp.get("machine");
    const type = sp.get("type");
    const status = sp.get("status");
    const where: Prisma.GroundingLightningItemWhereInput = {
      ...(!scope.all
        ? { positionCode: scope.positionCode ?? "__NO_POSITION__" }
        : positionCode && positionCode !== "ALL"
          ? { positionCode }
          : {}),
      ...(machine && machine !== "ALL" ? { machine } : {}),
      ...(q
        ? {
            OR: [
              { areaEquipment: { contains: q, mode: "insensitive" } },
              { note: { contains: q, mode: "insensitive" } },
              {
                points: {
                  some: {
                    defectDescription: { contains: q, mode: "insensitive" },
                  },
                },
              },
            ],
          }
        : {}),
      ...((type && type !== "ALL") || (status && status !== "ALL")
        ? {
            points: {
              some: {
                ...(type && type !== "ALL" ? { type } : {}),
                ...(status && status !== "ALL" ? { status } : {}),
              },
            },
          }
        : {}),
    };
    const [items, positionRows] = await Promise.all([
      prisma.groundingLightningItem.findMany({
        where,
        include: includeItem,
        orderBy: [
          { position: "asc" },
          { machine: "asc" },
          { areaEquipment: "asc" },
        ],
      }),
      prisma.groundingLightningItem.findMany({
        where: !scope.all
          ? { positionCode: scope.positionCode ?? "__NO_POSITION__" }
          : {},
        select: { positionCode: true, position: true },
        distinct: ["positionCode"],
        orderBy: { position: "asc" },
      }),
    ]);
    return ok(items.map(serializeGroundingItem), {
      positions: positionRows
        .filter((row) => row.positionCode)
        .map((row) => ({ code: row.positionCode, label: row.position })),
      scope,
    });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      GROUNDING_PERMISSIONS.catalog,
      ["manage", "full"],
      "Không đủ quyền thêm danh mục kiểm tra",
    );
    const body = (await req.json()) as Record<string, unknown>;
    const areaEquipment = String(body.areaEquipment ?? "").trim();
    const positionCode = String(body.positionCode ?? "").trim();
    const machine = isGroundingMachine(body.machine) ? body.machine : "COMMON";
    const types = Array.from(
      new Set(
        Array.isArray(body.types) ? body.types.filter(isGroundingType) : [],
      ),
    );
    if (!areaEquipment) return fail("Nhập khu vực/thiết bị");
    if (!isPositionCode(positionCode))
      return fail("Chọn đúng cương vị quản lý");
    if (!types.length) return fail("Chọn ít nhất một loại kiểm tra");
    const duplicate = await prisma.groundingLightningItem.findFirst({
      where: {
        positionCode,
        machine,
        areaEquipment: { equals: areaEquipment, mode: "insensitive" },
      },
      include: includeItem,
    });
    if (duplicate) {
      const addedTypes = types.filter(
        (pointType) =>
          !duplicate.points.some((point) => point.type === pointType),
      );
      const incomingNote = String(body.note ?? "").trim();
      const mergedNote =
        [duplicate.note, incomingNote]
          .filter((value): value is string => Boolean(value))
          .filter(
            (value, index, values) =>
              values.findIndex(
                (candidate) =>
                  candidate.toLocaleLowerCase("vi-VN") ===
                  value.toLocaleLowerCase("vi-VN"),
              ) === index,
          )
          .join("\n") || null;
      await prisma.$transaction([
        prisma.groundingLightningItem.update({
          where: { id: duplicate.id },
          data: { note: mergedNote },
        }),
        ...addedTypes.map((pointType) =>
          prisma.groundingLightningPoint.create({
            data: { itemId: duplicate.id, type: pointType },
          }),
        ),
      ]);
      const merged = await prisma.groundingLightningItem.findUniqueOrThrow({
        where: { id: duplicate.id },
        include: includeItem,
      });
      await audit(
        user.id,
        "MERGE_GROUNDING_LIGHTNING_ITEM",
        "GroundingLightningItem",
        merged.id,
        auditDetailWithPosition(user, areaEquipment),
        {
          beforeData: duplicate,
          afterData: merged,
          changedFields: addedTypes.map((pointType) => `points.${pointType}`),
        },
      );
      return ok(serializeGroundingItem(merged), { merged: true });
    }
    const created = await prisma.groundingLightningItem.create({
      data: {
        areaEquipment,
        positionCode,
        position: positionLabelOf(positionCode),
        machine,
        note: String(body.note ?? "").trim() || null,
        createdById: user.id,
        points: { create: types.map((pointType) => ({ type: pointType })) },
      },
      include: includeItem,
    });
    await audit(
      user.id,
      "CREATE_GROUNDING_LIGHTNING_ITEM",
      "GroundingLightningItem",
      created.id,
      auditDetailWithPosition(user, areaEquipment),
      { afterData: created },
    );
    return ok(serializeGroundingItem(created));
  });
}
