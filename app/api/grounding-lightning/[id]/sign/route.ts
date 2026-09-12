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

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      GROUNDING_PERMISSIONS.manage,
      ["personal", "manage", "full"],
      "Không đủ quyền xác nhận kiểm tra",
    );
    const item = await prisma.groundingLightningItem.findUnique({
      where: { id: params.id },
      include: { points: { include: { attachments: true } } },
    });
    if (!item) return fail("Không tìm thấy khu vực/thiết bị", 404);
    await assertGroundingScope(user, item);
    if (
      !item.points.length ||
      item.points.some((point) => point.status === "UNCHECKED")
    ) {
      return fail(
        "Phải hoàn tất kết quả của tất cả hạng mục trước khi xác nhận",
      );
    }
    if (
      item.points.some(
        (point) =>
          point.status === "DEFECT" && !point.defectDescription?.trim(),
      )
    ) {
      return fail("Hạng mục có khiếm khuyết phải ghi rõ nội dung");
    }
    const inspectorName = user.name ?? user.email ?? "";
    const inspection = await prisma.groundingLightningInspection.create({
      data: {
        itemId: item.id,
        note: item.note,
        inspectedById: user.id,
        inspectorName,
        inspectorPosition: user.position ?? null,
        // Giữ giá trị đánh dấu để tương thích dữ liệu cũ; không còn dùng ảnh chữ ký số.
        signatureKey: "USER_CONFIRMATION",
        results: {
          create: item.points.map((point) => ({
            type: point.type,
            status: point.status,
            defectDescription: point.defectDescription,
            imageKeys: point.attachments.map((attachment) => attachment.s3Key),
          })),
        },
      },
      include: { results: true },
    });
    await audit(
      user.id,
      "CONFIRM_GROUNDING_LIGHTNING_INSPECTION",
      "GroundingLightningInspection",
      inspection.id,
      auditDetailWithPosition(user, item.areaEquipment),
      { afterData: inspection },
    );
    return ok(inspection);
  });
}
