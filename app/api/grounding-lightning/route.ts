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
  groundingInspectorAvatars,
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
    const avatars = await groundingInspectorAvatars(items);
    return ok(
      items.map((item) => serializeGroundingItem(item, avatars)),
      {
        positions: positionRows
          .filter((row) => row.positionCode)
          .map((row) => ({ code: row.positionCode, label: row.position })),
        scope,
      },
    );
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    /*
     * Tính PHẠM VI trước rồi mới xét quyền theo vai trò — không đảo ngược thứ tự này.
     * Bốn nhóm "toàn quyền" (ADMIN/MANAGER/SUPERVISOR theo vai trò, Quản đốc/Phó quản
     * đốc/Kỹ thuật viên/Trưởng ca theo cương vị) bỏ qua thẳng cổng RBAC catalog bên dưới:
     * "Kỹ thuật viên" thường mang role TECHNICIAN giống mọi VHV khác, RBAC theo vai trò
     * (bảng grounding-lightning-catalog) không phân biệt được — chỉ groundingScope() mới
     * biết dựa vào CƯƠNG VỊ. Người bị giới hạn phạm vi (scope.all === false) vẫn phải qua
     * cổng RBAC như cũ: "personal" cho thêm trong đúng cương vị mình quản lý.
     */
    const scope = await groundingScopeWithPermissions(user);
    if (!scope.all) {
      await requirePermissionLevel(
        user,
        GROUNDING_PERMISSIONS.catalog,
        ["personal", "manage", "full"],
        "Không đủ quyền thêm danh mục kiểm tra",
      );
    }
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
    // Chặn tại đây, KHÔNG chỉ ẩn nút ở giao diện: người giữ cương vị A gọi thẳng API vẫn
    // không tạo được thiết bị cho cương vị B — đúng ranh giới "cương vị mình quản lý".
    if (!scope.all && positionCode !== scope.positionCode) {
      return fail("Chỉ được thêm thiết bị thuộc cương vị đang làm việc", 403);
    }
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
