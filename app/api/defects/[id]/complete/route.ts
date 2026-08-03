import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { deleteFromS3, publicUserRef } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { parseDateInput } from "@/lib/utils";
import { enqueueDefectSyncEvent } from "@/lib/defect-sync-outbox";
import { defectResultStatusOf } from "@/lib/defect-result-status";
import { recordMaterialRequestReplacements } from "@/lib/defect-material-request";

const HISTORY_PENDING_DAYS = 14;
const HISTORY_COMPLETED_PENDING_DAYS = 4;

// Tầng 4: avatar trong payload đi qua publicUserRef (proxy theo key) — không chở base64.
const HISTORY_INCLUDE = {
  createdBy: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true } },
  relatedDevices: {
    select: { deviceSeq: true, mappedUnit: true, device: { select: { seq: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

/**
 * Mọi phiếu được Google Sheet theo dõi (gồm phiếu tạo trên website rồi ghi lên
 * Sheet) chỉ tạo bản nháp chờ 14 ngày để n8n tiếp tục nhận dữ liệu sửa chữa.
 * Chỉ dữ liệu thủ công cũ, không tham gia hai chiều, được ghi lịch sử ngay.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-close", ["manage", "full"], "Không đủ quyền hoàn thành phiếu khiếm khuyết");
    const body = await req.json().catch(() => ({}));

    const defect = await prisma.defect.findUnique({
      where: { id: params.id },
      include: { relatedDevices: { select: { deviceSeq: true, mappedUnit: true } } },
    });
    if (!defect) return fail("Không tìm thấy khiếm khuyết", 404);
    const sheetOrigin = defect.sourceType === "GOOGLE_SHEETS" && !defect.websiteCreated;
    const sheetTracked = defect.sourceType === "GOOGLE_SHEETS" || defect.websiteCreated;
    if (sheetOrigin && defect.status !== "DA_XU_LY") {
      return fail("Chỉ xác nhận lịch sử khi Google Sheet đã ghi nhận khiếm khuyết được xử lý");
    }
    if (sheetTracked && !defect.deviceSeq) {
      return fail("Vui lòng lưu ánh xạ thiết bị trước khi xác nhận đưa vào lịch sử");
    }
    if (sheetTracked && defect.postRepairAwaitingMaterial) {
      return fail("Phiếu đang được đánh dấu chờ vật tư; vui lòng bỏ đánh dấu Tồn đọng trước khi xác nhận");
    }
    if (defect.syncState === "CONFIRMED") {
      return fail("Khiếm khuyết này đã được xác nhận vào lịch sử");
    }
    if (sheetTracked) {
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
    // SYC thay thế vật tư: người dùng chủ động tick "Ghi nhận đã thay thế" ở hộp
    // thoại hoàn thành. Không tự động, vì việc này dời hạn của Danh mục vật tư.
    const shouldRecordReplacement = Boolean(body.recordReplacement) && defect.isMaterialRequest;

    if (sheetTracked) {
      const startedAt = new Date();
      const repairCompleted = defectResultStatusOf(defect.repairResultRaw) === "DA_XU_LY";
      const pendingDays = repairCompleted ? HISTORY_COMPLETED_PENDING_DAYS : HISTORY_PENDING_DAYS;
      const finalizeAt = new Date(startedAt.getTime() + pendingDays * 24 * 60 * 60 * 1000);
      const pending = await prisma.$transaction(async (tx) => {
        const created = await tx.defectHistoryPending.create({
          data: {
            defectId: defect.id,
            // Đây là nội dung Vận hành xác nhận để ghi vào lịch sử. Dữ liệu
            // Sửa chữa được giữ riêng trong snapshot khi chốt sau thời gian chờ.
            workOrderNumber: body.workOrderNumber?.trim() || null,
            requestType: body.requestType?.trim() || defect.requestType,
            performedAt,
            content: body.content?.trim() || null,
            result: body.result?.trim() || null,
            confirmedById: user.id,
            confirmedByName: user.name,
            startedAt,
            finalizeAt,
          },
        });
        const updated = await tx.defect.update({
          where: { id: defect.id },
          data: {
            createdById: user.id,
            status: "DA_XU_LY",
            completedAt: startedAt,
            postRepairAwaitingMaterial: false,
            confirmedAt: startedAt,
            confirmedById: user.id,
            confirmedByName: user.name,
            confirmedHistoryId: null,
            // Giữ ACTIVE để n8n tiếp tục cập nhật cho tới khi chốt lịch sử.
            syncState: "ACTIVE",
          },
        });
        if (defect.websiteCreated) {
          await enqueueDefectSyncEvent(tx, { defect: updated, eventType: "UPDATE" });
        }
        if (shouldRecordReplacement) {
          await recordMaterialRequestReplacements(tx, { defectId: defect.id, userId: user.id, replacedAt: performedAt });
        }
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

    const history = await prisma.$transaction(async (tx) => {
      const createdHistory = await tx.defectHistory.create({
        data: {
          defectId: defect.id,
          unit: defect.unit,
          device: defect.device,
          deviceSeq: defect.deviceSeq, // khóa chuẩn kế thừa từ phiếu khiếm khuyết (Tầng 1)
          mappedDeviceUnit: defect.mappedDeviceUnit,
          system: defect.system,
          requestType: body.requestType?.trim() || defect.requestType,
          // Tách nội dung khiếm khuyết gốc khỏi nội dung VHV đã thực hiện.
          defectContent: defect.content,
          content: body.content?.trim() || null,
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
            create: defect.relatedDevices.map(({ deviceSeq, mappedUnit }) => ({ deviceSeq, mappedUnit })),
          },
        },
        include: HISTORY_INCLUDE,
      });
      const updatedDefect = await tx.defect.update({
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
      });
      if (defect.websiteCreated) {
        await enqueueDefectSyncEvent(tx, { defect: updatedDefect, eventType: "UPDATE" });
      }
      if (shouldRecordReplacement) {
        await recordMaterialRequestReplacements(tx, { defectId: defect.id, userId: user.id, replacedAt: performedAt });
      }
      return createdHistory;
    });

    await audit(user.id, "COMPLETE_DEFECT", "Defect", defect.id, auditDetailWithPosition(user, defect.requestNumber));

    const imageCleanupResults = await Promise.allSettled(originalImages.map((url) => deleteFromS3(url)));
    for (const cleanupResult of imageCleanupResults) {
      if (cleanupResult.status === "rejected") {
        console.error("[complete defect] Không thể xóa ảnh ghi nhận ban đầu", cleanupResult.reason);
      }
    }

    return ok({ ...history, createdBy: publicUserRef(history.createdBy) });
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      "defect-close",
      ["manage", "full"],
      "Không đủ quyền sửa thông tin lịch sử"
    );
    const body = await req.json().catch(() => ({}));
    const defect = await prisma.defect.findUnique({
      where: { id: params.id },
      include: {
        pendingHistory: { select: { id: true, startedAt: true, finalizeAt: true } },
      },
    });
    if (!defect) return fail("Không tìm thấy khiếm khuyết", 404);
    if (!defect.pendingHistory || defect.syncState === "CONFIRMED") {
      return fail("Phiếu không còn ở trạng thái chờ chốt lịch sử", 409);
    }

    const access = await resolveEquipmentAccessForUser(user);
    if (access.hasExplicitScopes && !access.canEditDeviceLike({ device: defect.device, system: defect.system })) {
      return fail("Cương vị của bạn không có quyền thao tác trên phiếu khiếm khuyết này", 403);
    }
    if (!body.performedAt) return fail("Vui lòng chọn ngày kết thúc");

    const performedAt = parseDateInput(body.performedAt);
    // Sửa thông tin không khởi động lại chu kỳ chờ. Quy tắc rút 14
    // xuống 4 ngày khi Sheet báo đã xử lý được thực hiện ở source sync.
    const { startedAt, finalizeAt } = defect.pendingHistory;

    const pending = await prisma.$transaction(async (tx) => {
      // Dùng cùng khóa với tiến trình chốt để việc sửa và chốt không thể chạy
      // đồng thời trên một bản nháp đã đến hạn.
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext(${defect.pendingHistory!.id}))::text AS "lock"
      `;
      const current = await tx.defectHistoryPending.findUnique({
        where: { id: defect.pendingHistory!.id },
        select: { id: true },
      });
      if (!current) return null;

      const updated = await tx.defectHistoryPending.update({
        where: { id: current.id },
        data: {
          workOrderNumber: body.workOrderNumber?.trim() || null,
          requestType: body.requestType?.trim() || defect.requestType,
          performedAt,
          content: body.content?.trim() || null,
          result: body.result?.trim() || null,
          confirmedById: user.id,
          confirmedByName: user.name,
        },
      });
      await tx.defect.update({
        where: { id: defect.id },
        data: {
          createdById: user.id,
          confirmedById: user.id,
          confirmedByName: user.name,
        },
      });
      return updated;
    });
    if (!pending) return fail("Phiếu vừa được chốt lịch sử, không thể tiếp tục sửa", 409);

    await audit(
      user.id,
      "UPDATE_DEFECT_HISTORY_PENDING",
      "Defect",
      defect.id,
      auditDetailWithPosition(user, `Tính lại hạn chốt lịch sử đến ${finalizeAt.toISOString()}`)
    );
    return ok({
      pending: true,
      workOrderNumber: pending.workOrderNumber,
      requestType: pending.requestType,
      performedAt: pending.performedAt,
      content: pending.content,
      result: pending.result,
      startedAt: pending.startedAt,
      finalizeAt: pending.finalizeAt,
    });
  });
}
