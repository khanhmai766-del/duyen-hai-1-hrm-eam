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
} from "@/lib/grounding-lightning";
import { deleteS3ObjectByKey } from "@/lib/s3";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      GROUNDING_PERMISSIONS.manage,
      ["personal", "manage", "full"],
      "Không đủ quyền xoá ảnh kiểm tra",
    );
    const attachment = await prisma.groundingLightningAttachment.findUnique({
      where: { id: params.id },
      include: { point: { include: { item: true } } },
    });
    if (!attachment) return fail("Không tìm thấy ảnh", 404);
    await assertGroundingScope(user, attachment.point.item);
    await prisma.$transaction([
      prisma.groundingLightningAttachment.delete({
        where: { id: attachment.id },
      }),
      prisma.groundingLightningItem.update({
        where: { id: attachment.point.itemId },
        data: { updatedAt: new Date() },
      }),
    ]);
    let cleanupFailed = false;
    try {
      await deleteS3ObjectByKey(attachment.s3Key);
    } catch {
      cleanupFailed = true;
    }
    await audit(
      user.id,
      "DELETE_GROUNDING_LIGHTNING_IMAGE",
      "GroundingLightningAttachment",
      attachment.id,
      auditDetailWithPosition(user, attachment.point.item.areaEquipment),
      { beforeData: attachment },
    );
    return ok({ id: attachment.id, cleanupFailed });
  });
}
