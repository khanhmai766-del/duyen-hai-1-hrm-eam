import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { deleteFromS3, publicUserRef } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { parseDateInput } from "@/lib/utils";

const HISTORY_PENDING_DAYS = 14;

// Tầng 4: avatar trong payload đi qua publicUserRef (proxy theo key) — không chở base64.
const HISTORY_INCLUDE = {
  createdBy: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true } },
  relatedDevices: {
    select: { deviceSeq: true, device: { select: { seq: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

/**
 * Phiếu thủ công được ghi lịch sử ngay như trước.
 * Phiếu Google Sheet chỉ tạo bản nháp chờ 14 ngày để n8n tiếp tục nhận dữ liệu
 * sửa chữa mới; tác vụ chốt lịch sử sẽ tạo DefectHistory sau thời hạn này.
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
    if (defect.sourceType === "GOOGLE_SHEETS") {
      const pending = await prisma.defectHistoryPending.findUnique({
        where: { defectId: defect.id },
        select: { finalizeAt: true },
      });
      if (pending) {
        return fail(`Phiếu đang chờ hoàn thiện lịch sử đến ${pending.finalizeAt.toLocaleDateString("vi-VN")}`);
      }
    }
    const access = await resolveEquipmentAccessForUser(user);
    if (access.hasExplicitScopes && !access.canEditDeviceLike({ device: defect.device, system: defect.system })) {
      return fail("Cương vị của bạn không có quyền thao tác trên phiếu khiếm khuyết này", 403);
    }

    const performedAt = body.performedAt ? parseDateInput(body.performedAt) : new Date();

    if (defect.sourceType === "GOOGLE_SHEETS") {
      const startedAt = new Date();
      const finalizeAt = new Date(startedAt.getTime() + HISTORY_PENDING_DAYS * 24 * 60 * 60 * 1000);
      const pending = await prisma.$transaction(async (tx) => {
        const created = await tx.defectHistoryPending.create({
          data: {
            defectId: defect.id,
            workOrderNumber: body.workOrderNumber?.trim() || null,
            requestType: body.requestType?.trim() || defect.requestType,
            performedAt,
            content: body.content?.trim() || defect.content,
            result: body.result?.trim() || null,
            confirmedById: user.id,
            confirmedByName: user.name,
            startedAt,
            finalizeAt,
          },
        });
        await tx.defect.update({
          where: { id: defect.id },
          data: {
            createdById: user.id,
            completedAt: startedAt,
            confirmedAt: startedAt,
            confirmedById: user.id,
            confirmedByName: user.name,
            confirmedHistoryId: null,
            // Giữ ACTIVE để n8n tiếp tục cập nhật cho tới khi chốt lịch sử.
            syncState: "ACTIVE",
          },
        });
        return created;
      });

      await audit(
        user.id,
        "CONFIRM_DEFECT_HISTORY_PENDING",
        "Defect",
        defect.id,
        auditDetailWithPosition(user, `Chờ chốt lịch sử đến ${finalizeAt.toISOString()}`)
      );
      return ok({
        pending: true,
        startedAt: pending.startedAt,
        finalizeAt: pending.finalizeAt,
      });
    }

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
          sourceSnapshot: undefined,
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
          createdById: user.id,
          status: "DA_XU_LY",
          // Mốc 14 ngày tính từ lúc VHV xác nhận chuyển phiếu sang Đã xử lý;
          // ngày thực hiện nghiệp vụ vẫn được lưu riêng trong DefectHistory.performedAt.
          completedAt: new Date(),
          postRepairAwaitingMaterial: false,
          images: [],
          imageUrl: null,
          syncState: defect.syncState,
          confirmedAt: defect.confirmedAt,
          confirmedById: defect.confirmedById,
          confirmedByName: defect.confirmedByName,
        },
      }),
    ]);

    await audit(user.id, "COMPLETE_DEFECT", "Defect", defect.id, auditDetailWithPosition(user, defect.requestNumber));
    return ok({ ...history, createdBy: publicUserRef(history.createdBy) });
  });
}
