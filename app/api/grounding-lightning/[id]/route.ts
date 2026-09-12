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
  assertGroundingScope,
  isGroundingMachine,
  isGroundingStatus,
  isGroundingType,
  groundingInspectorAvatars,
  serializeGroundingItem,
} from "@/lib/grounding-lightning";
import { deleteS3ObjectByKey } from "@/lib/s3";
import { isPositionCode, positionLabelOf } from "@/lib/position-catalog";

const includeItem = {
  points: {
    orderBy: { type: "asc" as const },
    include: { attachments: { orderBy: { createdAt: "asc" as const } } },
  },
  inspections: {
    orderBy: { signedAt: "desc" as const },
    take: 1,
    include: { results: true },
  },
};

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  return handle(async () => {
    const user = await requireUser();
    const current = await prisma.groundingLightningItem.findUnique({
      where: { id: params.id },
      include: includeItem,
    });
    if (!current) return fail("Không tìm thấy khu vực/thiết bị", 404);
    await assertGroundingScope(user, current);
    const body = (await req.json()) as Record<string, unknown>;
    const editsCatalog = [
      "areaEquipment",
      "positionCode",
      "machine",
      "types",
    ].some((key) => key in body);
    await requirePermissionLevel(
      user,
      editsCatalog
        ? GROUNDING_PERMISSIONS.catalog
        : GROUNDING_PERMISSIONS.manage,
      editsCatalog ? ["manage", "full"] : ["personal", "manage", "full"],
      editsCatalog
        ? "Không đủ quyền sửa danh mục kiểm tra"
        : "Không đủ quyền cập nhật kết quả kiểm tra",
    );

    const data: Record<string, unknown> = { updatedAt: new Date() };
    if ("note" in body) data.note = String(body.note ?? "").trim() || null;
    if ("areaEquipment" in body) {
      const value = String(body.areaEquipment ?? "").trim();
      if (!value) return fail("Nhập khu vực/thiết bị");
      data.areaEquipment = value;
    }
    if ("machine" in body) {
      if (!isGroundingMachine(body.machine)) return fail("Tổ máy không hợp lệ");
      data.machine = body.machine;
    }
    if ("positionCode" in body) {
      const code = String(body.positionCode ?? "");
      if (!isPositionCode(code)) return fail("Cương vị không hợp lệ");
      data.positionCode = code;
      data.position = positionLabelOf(code);
    }
    if (
      ["areaEquipment", "positionCode", "machine"].some((key) => key in body)
    ) {
      const areaEquipment = String(data.areaEquipment ?? current.areaEquipment);
      const positionCode = String(
        data.positionCode ?? current.positionCode ?? "",
      );
      const machine = String(data.machine ?? current.machine);
      const duplicate = await prisma.groundingLightningItem.findFirst({
        where: {
          id: { not: current.id },
          positionCode,
          machine,
          areaEquipment: { equals: areaEquipment, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (duplicate)
        return fail(
          "Khu vực/thiết bị này đã tồn tại trong cùng cương vị và tổ máy",
          409,
        );
    }

    const requestedTypes =
      "types" in body
        ? Array.from(
            new Set(
              Array.isArray(body.types)
                ? body.types.filter(isGroundingType)
                : [],
            ),
          )
        : current.points.map((point) => point.type);
    if (!requestedTypes.length)
      return fail("Thiết bị phải có ít nhất một loại kiểm tra");
    const removedPoints = current.points.filter(
      (point) => !requestedTypes.includes(point.type as any),
    );
    if (removedPoints.length) {
      await requirePermissionLevel(
        user,
        GROUNDING_PERMISSIONS.delete,
        ["manage", "full"],
        "Không đủ quyền xoá loại kiểm tra khỏi thiết bị",
      );
    }
    const addedTypes = requestedTypes.filter(
      (pointType) => !current.points.some((point) => point.type === pointType),
    );
    const cleanupKeys = removedPoints.flatMap((point) =>
      point.attachments.map((attachment) => attachment.s3Key),
    );

    const rawResults = Array.isArray(body.results)
      ? (body.results as Record<string, unknown>[])
      : [];
    const resultUpdates: Array<{
      id: string;
      status: string;
      defectDescription: string | null;
      removeImages: boolean;
    }> = [];
    for (const raw of rawResults) {
      const pointType = raw.type;
      const status = raw.status;
      if (!isGroundingType(pointType) || !isGroundingStatus(status))
        return fail("Kết quả kiểm tra không hợp lệ");
      const point = current.points.find(
        (candidate) => candidate.type === pointType,
      );
      if (!point || !requestedTypes.includes(pointType))
        return fail("Loại kiểm tra không tồn tại trên thiết bị");
      const defectDescription =
        String(raw.defectDescription ?? "").trim() || null;
      if (status === "DEFECT" && !defectDescription)
        return fail(
          `Nhập nội dung khiếm khuyết ${pointType === "LIGHTNING" ? "chống sét" : "tiếp địa"}`,
        );
      if (status !== "DEFECT")
        cleanupKeys.push(
          ...point.attachments.map((attachment) => attachment.s3Key),
        );
      resultUpdates.push({
        id: point.id,
        status,
        defectDescription: status === "DEFECT" ? defectDescription : null,
        removeImages: status !== "DEFECT",
      });
    }

    await prisma.$transaction([
      prisma.groundingLightningItem.update({ where: { id: current.id }, data }),
      ...removedPoints.map((point) =>
        prisma.groundingLightningPoint.delete({ where: { id: point.id } }),
      ),
      ...addedTypes.map((pointType) =>
        prisma.groundingLightningPoint.create({
          data: { itemId: current.id, type: pointType },
        }),
      ),
      ...resultUpdates.flatMap((result) => [
        ...(result.removeImages
          ? [
              prisma.groundingLightningAttachment.deleteMany({
                where: { pointId: result.id },
              }),
            ]
          : []),
        prisma.groundingLightningPoint.update({
          where: { id: result.id },
          data: {
            status: result.status,
            defectDescription: result.defectDescription,
          },
        }),
      ]),
    ]);
    const cleanup = await Promise.allSettled(
      Array.from(new Set(cleanupKeys)).map(deleteS3ObjectByKey),
    );
    const updated = await prisma.groundingLightningItem.findUniqueOrThrow({
      where: { id: current.id },
      include: includeItem,
    });
    await audit(
      user.id,
      "UPDATE_GROUNDING_LIGHTNING_ITEM",
      "GroundingLightningItem",
      current.id,
      auditDetailWithPosition(user, current.areaEquipment),
      {
        beforeData: current,
        afterData: updated,
        changedFields: Object.keys(body),
      },
    );
    return ok(
      serializeGroundingItem(updated, await groundingInspectorAvatars([updated])),
      cleanup.some((result) => result.status === "rejected")
        ? { warning: "Có ảnh chưa xoá được khỏi S3" }
        : undefined,
    );
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      GROUNDING_PERMISSIONS.delete,
      ["manage", "full"],
      "Không đủ quyền xoá thiết bị khỏi danh mục kiểm tra",
    );
    const current = await prisma.groundingLightningItem.findUnique({
      where: { id: params.id },
      include: {
        points: { include: { attachments: true } },
        inspections: true,
      },
    });
    if (!current) return fail("Không tìm thấy khu vực/thiết bị", 404);
    await assertGroundingScope(user, current);
    const keys = current.points.flatMap((point) =>
      point.attachments.map((attachment) => attachment.s3Key),
    );
    await prisma.groundingLightningItem.delete({ where: { id: current.id } });
    const cleanup = await Promise.allSettled(keys.map(deleteS3ObjectByKey));
    await audit(
      user.id,
      "DELETE_GROUNDING_LIGHTNING_ITEM",
      "GroundingLightningItem",
      current.id,
      auditDetailWithPosition(user, current.areaEquipment),
      { beforeData: current },
    );
    return ok({
      id: current.id,
      cleanupFailed: cleanup.filter((result) => result.status === "rejected")
        .length,
    });
  });
}
