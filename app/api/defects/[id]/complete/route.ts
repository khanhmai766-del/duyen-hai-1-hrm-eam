import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { maybeUploadDataUrlList } from "@/lib/s3";

const HISTORY_INCLUDE = { createdBy: { select: { id: true, name: true, position: true, avatarUrl: true } } };

/**
 * Đánh dấu một khiếm khuyết đã thực hiện xong:
 *  - sinh một DefectHistory (lịch sử theo cương vị) với số phiếu công tác, ngày
 *    thực hiện, kết quả, ảnh (≤3) + snapshot tổ máy/cương vị/nội dung từ khiếm khuyết,
 *  - cập nhật khiếm khuyết: status = DA_XU_LY, completedAt = thời điểm thực hiện.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR", "TECHNICIAN"]);
    const body = await req.json().catch(() => ({}));

    const defect = await prisma.defect.findUnique({ where: { id: params.id } });
    if (!defect) return fail("Không tìm thấy khiếm khuyết", 404);
    const access = await resolveEquipmentAccessForUser(user);
    if (access.hasExplicitScopes && !access.canEditDeviceLike({ device: defect.device, system: defect.system })) {
      return fail("Cương vị của bạn không có quyền thao tác trên phiếu khiếm khuyết này", 403);
    }

    const performedAt = body.performedAt ? new Date(body.performedAt) : new Date();
    const images = await maybeUploadDataUrlList(
      Array.isArray(body.images) ? body.images.filter(Boolean).slice(0, 3) : [],
      "defect-history/images",
      "image"
    );

    const [history] = await prisma.$transaction([
      prisma.defectHistory.create({
        data: {
          defectId: defect.id,
          unit: defect.unit,
          device: defect.device,
          system: defect.system,
          requestType: body.requestType?.trim() || defect.requestType,
          content: body.content?.trim() || defect.content,
          requestNumber: defect.requestNumber,
          workOrderNumber: body.workOrderNumber?.trim() || null,
          performedAt,
          result: body.result?.trim() || null,
          images,
          createdById: user.id,
        },
        include: HISTORY_INCLUDE,
      }),
      prisma.defect.update({
        where: { id: defect.id },
        data: { status: "DA_XU_LY", completedAt: performedAt },
      }),
    ]);

    await audit(user.id, "COMPLETE_DEFECT", "Defect", defect.id, defect.requestNumber ?? undefined);
    return ok(history);
  });
}
