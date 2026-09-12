import type { NextRequest } from "next/server";
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
import { s3ProxyUrl, uploadImageBufferToS3 } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      GROUNDING_PERMISSIONS.manage,
      ["personal", "manage", "full"],
      "Không đủ quyền tải ảnh kiểm tra",
    );
    const form = await req.formData();
    const pointId = String(form.get("pointId") ?? "");
    const file = form.get("file");
    if (!(file instanceof File)) return fail("Thiếu tệp ảnh");
    if (!ALLOWED.has(file.type))
      return fail("Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF");
    if (file.size > 15 * 1024 * 1024) return fail("Ảnh vượt quá 15MB");
    const point = await prisma.groundingLightningPoint.findUnique({
      where: { id: pointId },
      include: { item: true },
    });
    if (!point || point.itemId !== params.id)
      return fail("Không tìm thấy hạng mục kiểm tra", 404);
    await assertGroundingScope(user, point.item);
    if (point.status !== "DEFECT")
      return fail("Chỉ bổ sung ảnh khi hạng mục đang có khiếm khuyết");
    /*
     * MỘT ảnh cho mỗi hạng mục. Chặn TRƯỚC khi đẩy lên S3 — chặn sau là đã có một object
     * nằm lại trên S3 mà không dòng nào trong CSDL trỏ tới, không ai dọn được nữa.
     */
    const existing = await prisma.groundingLightningAttachment.count({
      where: { pointId: point.id },
    });
    if (existing > 0)
      return fail("Mỗi hạng mục chỉ lưu 1 ảnh — hãy xoá ảnh hiện có rồi tải ảnh khác");

    const uploaded = await uploadImageBufferToS3({
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
      folder: `grounding-lightning/${point.itemId}/${point.type.toLowerCase()}`,
      preset: "image",
    });
    const attachment = await prisma.$transaction(async (tx) => {
      const created = await tx.groundingLightningAttachment.create({
        data: {
          pointId: point.id,
          s3Key: uploaded.key,
          originalName: file.name,
          mimeType: file.type,
          bytes: file.size,
          uploadedById: user.id,
        },
      });
      await tx.groundingLightningItem.update({
        where: { id: point.itemId },
        data: { updatedAt: new Date() },
      });
      return created;
    });
    await audit(
      user.id,
      "UPLOAD_GROUNDING_LIGHTNING_IMAGE",
      "GroundingLightningAttachment",
      attachment.id,
      auditDetailWithPosition(
        user,
        `${point.item.areaEquipment} · ${point.type}`,
      ),
    );
    return ok({ ...attachment, url: s3ProxyUrl(uploaded.key, file.name) });
  });
}
