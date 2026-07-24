import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { assertSeqEditable, resolveEquipmentAccessForUser } from "@/lib/server-access";
import { normalizeImpactValue } from "@/lib/defect-impact-fields";
import { deleteFromS3, maybeUploadDataUrlList, publicUserRef } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { parseDateInput } from "@/lib/utils";
import { resolveDefectShiftLeader } from "@/lib/defect-shift-leader";
import { normalizeDefectSeverityCriteria } from "@/lib/constants";
import { validateDefectImages } from "@/lib/defect-images";
import { parseReminderCount } from "@/lib/defect-reminder";
import { MAX_DEFECT_RELATED_DEVICES, normalizeRelatedDeviceSeqs } from "@/lib/defect-related-devices";

// Tầng 4: avatar trong payload đi qua publicUserRef (proxy theo key) — không chở base64.
const INCLUDE = {
  createdBy: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true } },
  relatedDevices: {
    select: { deviceSeq: true, device: { select: { seq: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-manage", ["manage", "full"], "Không đủ quyền cập nhật khiếm khuyết");
    const body = await req.json();
    const existing = await prisma.defect.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Không tìm thấy phiếu khiếm khuyết", 404);
    const reminderCount = body.reminderCount === undefined
      ? existing.reminderCount
      : parseReminderCount(body.reminderCount);
    if (reminderCount === null) return fail("Số lần nhắc lại phải là số nguyên không âm");
    const relatedDeviceSeqs = body.relatedDeviceSeqs === undefined
      ? undefined
      : normalizeRelatedDeviceSeqs(body.relatedDeviceSeqs, body.device ?? existing.deviceSeq ?? existing.device);
    if (relatedDeviceSeqs === null) {
      return fail(`Danh sách thiết bị liên quan không hợp lệ hoặc vượt quá ${MAX_DEFECT_RELATED_DEVICES} thiết bị`);
    }
    if (existing.device) await assertSeqEditable(user, existing.device);
    if (body.device) await assertSeqEditable(user, String(body.device));
    if (relatedDeviceSeqs) {
      await Promise.all(relatedDeviceSeqs.map((seq) => assertSeqEditable(user, seq)));
      const existingRelatedCount = await prisma.equipmentNode.count({ where: { seq: { in: relatedDeviceSeqs } } });
      if (existingRelatedCount !== relatedDeviceSeqs.length) return fail("Có thiết bị liên quan không tồn tại");
    }
    if (existing.sourceType === "GOOGLE_SHEETS") {
      const requestedDeviceSeq = String(body.device ?? "").trim();
      const requestedSystemSeq = String(body.deviceSystemSeq ?? "").trim();
      if (!requestedSystemSeq) return fail("Vui lòng chọn Hệ thống trước khi lưu ánh xạ");
      if (!requestedDeviceSeq) return fail("Vui lòng chọn Thiết bị chính trước khi lưu ánh xạ");

      const equipmentNodes = await prisma.equipmentNode.findMany({
        select: { seq: true, parentSeq: true },
      });
      const parentBySeq = new Map(equipmentNodes.map((node) => [node.seq, node.parentSeq]));
      if (!parentBySeq.has(requestedSystemSeq)) return fail("Hệ thống đã chọn không tồn tại");
      if (!parentBySeq.has(requestedDeviceSeq)) return fail("Thiết bị đã chọn không tồn tại");

      let cursor: string | null = requestedDeviceSeq;
      let belongsToSystem = false;
      while (cursor) {
        if (cursor === requestedSystemSeq) {
          belongsToSystem = true;
          break;
        }
        cursor = parentBySeq.get(cursor) ?? null;
      }
      if (!belongsToSystem) return fail("Thiết bị đã chọn không thuộc Hệ thống đang ánh xạ");

      const existingImages = existing.images.length > 0
        ? existing.images
        : existing.imageUrl
          ? [existing.imageUrl]
          : [];
      const rawImages = body.images === undefined
        ? undefined
        : Array.isArray(body.images)
          ? body.images.filter(Boolean)
          : [];
      const imageError = rawImages ? validateDefectImages(rawImages) : null;
      if (imageError) return fail(imageError);
      if (rawImages && rawImages.length > 0 && !["1", "2"].includes(existing.severity ?? "")) {
        return fail("Chỉ khiếm khuyết Mức 1 hoặc Mức 2 mới được thêm ảnh");
      }
      const images = rawImages
        ? await maybeUploadDataUrlList(rawImages, "defects/images", "image")
        : undefined;
      const deviceSeq =
        body.device !== undefined
          ? body.device
            ? requestedDeviceSeq
            : null
          : undefined;
      const defect = await prisma.defect.update({
        where: { id: params.id },
        data: {
          device: body.device !== undefined ? body.device || null : undefined,
          deviceSeq,
          postRepairAwaitingMaterial:
            existing.status === "DA_XU_LY" && typeof body.postRepairAwaitingMaterial === "boolean"
              ? body.postRepairAwaitingMaterial
              : undefined,
          images,
          imageUrl: images ? null : undefined,
          relatedDevices: relatedDeviceSeqs
            ? {
                deleteMany: {},
                create: relatedDeviceSeqs.map((relatedSeq) => ({ deviceSeq: relatedSeq })),
              }
            : undefined,
        },
        include: INCLUDE,
      });
      if (images) {
        const retained = new Set(images);
        await Promise.all(existingImages.filter((url) => !retained.has(url)).map((url) => deleteFromS3(url)));
      }
      await audit(user.id, "UPDATE_SYNCED_DEFECT_LOCAL_DATA", "Defect", defect.id, auditDetailWithPosition(user));
      return ok({ ...defect, createdBy: publicUserRef(defect.createdBy) });
    }
    if (body.shiftLeaderId !== undefined && !String(body.shiftLeaderId ?? "").trim()) {
      return fail("Vui lòng chọn Trưởng ca");
    }
    if (body.shiftLeaderId === undefined && !existing.shiftLeaderId) {
      return fail("Vui lòng chọn Trưởng ca");
    }
    const shiftLeader = body.shiftLeaderId !== undefined
      ? await resolveDefectShiftLeader(body.shiftLeaderId)
      : undefined;
    if (body.shiftLeaderId && !shiftLeader) return fail("Nhân viên được chọn không có cương vị Trưởng ca hoặc đã ngừng hoạt động");
    const nextSeverity = body.severity !== undefined ? String(body.severity || "") : existing.severity;
    const rawImages = body.images !== undefined
      ? (Array.isArray(body.images) ? body.images.filter(Boolean) : [])
      : undefined;
    const imageError = rawImages ? validateDefectImages(rawImages) : null;
    if (imageError) return fail(imageError);
    const existingImages = existing.images.length > 0
      ? existing.images
      : existing.imageUrl
        ? [existing.imageUrl]
        : [];
    const nextImageCount = rawImages !== undefined ? rawImages.length : existingImages.length;
    if (nextImageCount > 0 && !["1", "2"].includes(nextSeverity ?? "")) {
      return fail("Chỉ khiếm khuyết Mức 1 hoặc Mức 2 mới được thêm ảnh");
    }
    const images = rawImages !== undefined
      ? await maybeUploadDataUrlList(rawImages, "defects/images", "image")
      : undefined;
    // Đồng bộ khóa chuẩn deviceSeq khi client gửi trường device (chỉ gán seq có thật trong cây).
    const deviceSeq =
      body.device !== undefined
        ? body.device
          ? (await prisma.equipmentNode.findUnique({ where: { seq: String(body.device) }, select: { seq: true } }))?.seq ?? null
          : null
        : undefined;
    const defect = await prisma.defect.update({
      where: { id: params.id },
      data: {
        unit: body.unit,
        device: body.device !== undefined ? body.device || null : undefined,
        deviceSeq,
        system: body.system !== undefined ? body.system || null : undefined,
        severity: body.severity !== undefined ? body.severity || null : undefined,
        severityCriteria:
          body.severity !== undefined || body.severityCriteria !== undefined
            ? normalizeDefectSeverityCriteria(body.severity ?? existing.severity, body.severityCriteria ?? existing.severityCriteria)
            : undefined,
        condition: body.condition !== undefined ? body.condition || null : undefined,
        requestType: body.requestType !== undefined ? body.requestType || null : undefined,
        requestNumber: body.requestNumber !== undefined ? body.requestNumber?.trim() || null : undefined,
        content: body.content !== undefined ? body.content?.trim() || null : undefined,
        status: body.status,
        detectedAt: body.detectedAt !== undefined ? (body.detectedAt ? parseDateInput(body.detectedAt) : null) : undefined,
        reminderCount: body.reminderCount !== undefined ? reminderCount : undefined,
        lastRemindedAt:
          reminderCount === 0
            ? null
            : body.lastRemindedAt !== undefined
              ? body.lastRemindedAt
                ? parseDateInput(body.lastRemindedAt)
                : null
              : undefined,
        shiftLeaderId: body.shiftLeaderId !== undefined ? shiftLeader?.id ?? null : undefined,
        shiftLeaderName: body.shiftLeaderId !== undefined ? shiftLeader?.name ?? null : undefined,
        note: body.note !== undefined ? body.note?.trim() || null : undefined,
        images,
        // Khi gửi 1 trong 2 trường ảnh hưởng thì cập nhật cả hai (giữ nguyên hành vi cũ);
        // không gửi gì thì để undefined → Prisma bỏ qua, không đổi giá trị.
        fireSafetyImpact:
          body.fireSafetyImpact !== undefined || body.environmentSafetyImpact !== undefined
            ? normalizeImpactValue(body.fireSafetyImpact)
            : undefined,
        environmentSafetyImpact:
          body.fireSafetyImpact !== undefined || body.environmentSafetyImpact !== undefined
            ? normalizeImpactValue(body.environmentSafetyImpact)
            : undefined,
        relatedDevices: relatedDeviceSeqs
          ? {
              deleteMany: {},
              create: relatedDeviceSeqs.map((deviceSeq) => ({ deviceSeq })),
            }
          : undefined,
      },
      include: INCLUDE,
    });
    if (images) {
      const retained = new Set(images);
      await Promise.all(existingImages.filter((url) => !retained.has(url)).map((url) => deleteFromS3(url)));
    }
    await audit(user.id, "UPDATE_DEFECT", "Defect", defect.id, auditDetailWithPosition(user));
    return ok({ ...defect, createdBy: publicUserRef(defect.createdBy) });
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-close", ["approve", "manage", "full"], "Không đủ quyền xoá khiếm khuyết");
    const existing = await prisma.defect.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Không tìm thấy phiếu khiếm khuyết", 404);
    if (existing.sourceType === "GOOGLE_SHEETS") {
      return fail("Không thể xoá dữ liệu phản chiếu từ Google Sheet; hãy xử lý tại nguồn", 400);
    }
    const access = await resolveEquipmentAccessForUser(user);
    if (access.hasExplicitScopes && !access.canEditDeviceLike({ device: existing.device, system: existing.system })) {
      return fail("Cương vị của bạn không có quyền thao tác trên phiếu khiếm khuyết này", 403);
    }
    await prisma.defect.delete({ where: { id: params.id } });
    const storedImages = existing.images.length > 0 ? existing.images : existing.imageUrl ? [existing.imageUrl] : [];
    await Promise.all(storedImages.map((url) => deleteFromS3(url)));
    await audit(user.id, "DELETE_DEFECT", "Defect", params.id, auditDetailWithPosition(user));
    return ok({ id: params.id });
  });
}
