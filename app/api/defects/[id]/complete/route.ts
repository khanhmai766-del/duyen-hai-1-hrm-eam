import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { deleteFromS3, publicUserRef } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { parseDateInput } from "@/lib/utils";

// Tầng 4: avatar trong payload đi qua publicUserRef (proxy theo key) — không chở base64.
const HISTORY_INCLUDE = {
  createdBy: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true } },
  relatedDevices: {
    select: { deviceSeq: true, device: { select: { seq: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

/**
 * Đánh dấu một khiếm khuyết đã thực hiện xong:
 *  - sinh một DefectHistory (lịch sử theo cương vị) với số phiếu công tác, ngày
 *    thực hiện, kết quả, ảnh (≤3) + snapshot tổ máy/cương vị/nội dung từ khiếm khuyết,
 *  - cập nhật khiếm khuyết: status = DA_XU_LY, completedAt = thời điểm thực hiện.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-manage", ["create", "manage", "full"], "Không đủ quyền xử lý khiếm khuyết");
    const body = await req.json().catch(() => ({}));

    const defect = await prisma.defect.findUnique({
      where: { id: params.id },
      include: { relatedDevices: { select: { deviceSeq: true } } },
    });
    if (!defect) return fail("Không tìm thấy khiếm khuyết", 404);
    if (defect.sourceType === "GOOGLE_SHEETS" && defect.status !== "DA_XU_LY") {
      return fail("Chỉ xác nhận lịch sử khi Google Sheet đã ghi nhận khiếm khuyết được xử lý");
    }
    if (defect.sourceType === "GOOGLE_SHEETS" && !defect.deviceSeq) {
      return fail("Vui lòng lưu ánh xạ thiết bị trước khi xác nhận đưa vào lịch sử");
    }
    if (defect.sourceType === "GOOGLE_SHEETS" && defect.postRepairAwaitingMaterial) {
      return fail("Phiếu đang được đánh dấu chờ vật tư; vui lòng bỏ đánh dấu Tồn đọng trước khi xác nhận");
    }
    if (defect.syncState === "CONFIRMED") {
      return fail("Khiếm khuyết này đã được xác nhận vào lịch sử");
    }
    const access = await resolveEquipmentAccessForUser(user);
    if (access.hasExplicitScopes && !access.canEditDeviceLike({ device: defect.device, system: defect.system })) {
      return fail("Cương vị của bạn không có quyền thao tác trên phiếu khiếm khuyết này", 403);
    }

    const performedAt = body.performedAt ? parseDateInput(body.performedAt) : new Date();
    // Ảnh ghi nhận ban đầu chỉ tồn tại trong vòng đời phiếu đang xử lý.
    // Khi xác nhận lịch sử, xoá ảnh khỏi S3 và không nhận thêm ảnh ở bước này.
    const originalImages = defect.images.length > 0 ? defect.images : defect.imageUrl ? [defect.imageUrl] : [];
    await Promise.all(originalImages.map((url) => deleteFromS3(url)));

    const [history] = await prisma.$transaction([
      prisma.defectHistory.create({
        data: {
          defectId: defect.id,
          unit: defect.unit,
          device: defect.device,
          deviceSeq: defect.deviceSeq, // khóa chuẩn kế thừa từ phiếu khiếm khuyết (Tầng 1)
          system: defect.system,
          requestType: body.requestType?.trim() || defect.requestType,
          content: body.content?.trim() || defect.content,
          requestNumber: defect.requestNumber,
          reminderCount: defect.reminderCount,
          lastRemindedAt: defect.lastRemindedAt,
          reminderRaw: defect.reminderRaw,
          sourceKey: defect.sourceKey,
          sourceSnapshot: defect.sourceType === "GOOGLE_SHEETS"
            ? {
                sourceSpreadsheetId: defect.sourceSpreadsheetId,
                sourceSheetName: defect.sourceSheetName,
                sourceRow: defect.sourceRow,
                sourceDeviceRaw: defect.sourceDeviceRaw,
                sourcePositionRaw: defect.sourcePositionRaw,
                sourceStatusRaw: defect.sourceStatusRaw,
                repairResultRaw: defect.repairResultRaw,
                sourceStatusMismatch: defect.sourceStatusMismatch,
                sourceCompletedAt: defect.sourceCompletedAt,
                repeatedRepairRaw: defect.repeatedRepairRaw,
                fireSafetyImpact: defect.fireSafetyImpact,
                environmentSafetyImpact: defect.environmentSafetyImpact,
                severity: defect.severity,
                condition: defect.condition,
                note: defect.note,
              }
            : undefined,
          workOrderNumber: body.workOrderNumber?.trim() || null,
          performedAt,
          result: body.result?.trim() || null,
          images: [],
          createdById: user.id,
          relatedDevices: {
            create: defect.relatedDevices.map(({ deviceSeq }) => ({ deviceSeq })),
          },
        },
        include: HISTORY_INCLUDE,
      }),
      prisma.defect.update({
        where: { id: defect.id },
        data: {
          status: "DA_XU_LY",
          completedAt: performedAt,
          postRepairAwaitingMaterial: false,
          images: [],
          imageUrl: null,
          syncState: defect.sourceType === "GOOGLE_SHEETS" ? "CONFIRMED" : defect.syncState,
          confirmedAt: defect.sourceType === "GOOGLE_SHEETS" ? new Date() : defect.confirmedAt,
          confirmedById: defect.sourceType === "GOOGLE_SHEETS" ? user.id : defect.confirmedById,
          confirmedByName: defect.sourceType === "GOOGLE_SHEETS" ? user.name : defect.confirmedByName,
        },
      }),
    ]);

    if (defect.sourceType === "GOOGLE_SHEETS") {
      await prisma.defect.update({
        where: { id: defect.id },
        data: { confirmedHistoryId: history.id },
      });
    }

    await audit(user.id, "COMPLETE_DEFECT", "Defect", defect.id, auditDetailWithPosition(user, defect.requestNumber));
    return ok({ ...history, createdBy: publicUserRef(history.createdBy) });
  });
}
