import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { assertSeqEditable, resolveEquipmentAccessForUser } from "@/lib/server-access";
import { normalizeImpactValue } from "@/lib/defect-impact-fields";
import { deleteFromS3, maybeUploadDataUrlList, publicUserRef } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { parseDateInput } from "@/lib/utils";
import { resolveDefectShiftLeader } from "@/lib/defect-shift-leader";
import { DEFECT_COMMON_SUB_UNITS, normalizeDefectSeverityCriteria } from "@/lib/constants";
import { validateDefectImages } from "@/lib/defect-images";
import { MAX_DEFECT_RELATED_DEVICES, normalizeRelatedDeviceSeqs } from "@/lib/defect-related-devices";
import { enqueueDefectSyncEvent } from "@/lib/defect-sync-outbox";
import { canViewUnmappedDefectPosition } from "@/lib/positions";
import { positionCodeOf } from "@/lib/position-catalog";
import {
  normalizeMappedUnit,
  validateMappedDevice,
  type DefectDeviceMapping,
} from "@/lib/defect-device-mapping";
import { isDefectSyncFeatureEnabled } from "@/lib/defect-two-way-sync";

// Tầng 4: avatar trong payload đi qua publicUserRef (proxy theo key) — không chở base64.
const INCLUDE = {
  createdBy: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true } },
  node: { select: { seq: true, name: true } },
  relatedDevices: {
    select: { deviceSeq: true, mappedUnit: true, device: { select: { seq: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  pendingHistory: {
    select: {
      startedAt: true,
      finalizeAt: true,
      workOrderNumber: true,
      requestType: true,
      performedAt: true,
      content: true,
      result: true,
    },
  },
};

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const defect = await prisma.defect.findUnique({
      where: { id: params.id },
      include: INCLUDE,
    });
    if (!defect) return fail("Không tìm thấy phiếu khiếm khuyết", 404);

    const access = await resolveEquipmentAccessForUser(user);
    // Phiếu đồng bộ chưa ánh xạ dùng cột Cương vị từ Sheet để phân quyền; khi
    // đã ánh xạ thì chuyển sang áp scope cây thiết bị.
    const canView =
      defect.sourceType === "GOOGLE_SHEETS" && !defect.deviceSeq
        ? canViewUnmappedDefectPosition(defect.system, user.currentPosition ?? user.position)
        : defect.deviceSeq
        ? access.canViewSeq(defect.deviceSeq)
        : access.canViewDeviceLike({ device: defect.device, system: defect.system });
    if (access.hasExplicitScopes && !canView) {
      return fail("Cương vị của bạn không có quyền xem phiếu khiếm khuyết này", 403);
    }

    return ok({ ...defect, createdBy: publicUserRef(defect.createdBy) });
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-manage", ["manage", "full"], "Không đủ quyền cập nhật khiếm khuyết");
    const body = await req.json();
    const existing = await prisma.defect.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Không tìm thấy phiếu khiếm khuyết", 404);
    const operationUpdateAvailable = await isDefectSyncFeatureEnabled("UPDATE");
    const operationFields = [
      "severity",
      "severityCriteria",
      "status",
      "fireSafetyImpact",
      "environmentSafetyImpact",
      "condition",
      "note",
      "images",
      "postRepairAwaitingMaterial",
    ];
    if (
      !operationUpdateAvailable
      && operationFields.some((field) => body[field] !== undefined)
    ) {
      return fail("Cập nhật Vận hành đang tạm khóa; bạn vẫn có thể ánh xạ thiết bị", 503);
    }
    const isInitialSheetMapping =
      existing.sourceType === "GOOGLE_SHEETS"
      && !existing.websiteCreated
      && !existing.deviceSeq;
    const content = body.content === undefined ? String(existing.content ?? "").trim() : String(body.content ?? "").trim();
    if (!content) return fail("Vui lòng nhập nội dung khiếm khuyết");
    const relatedDeviceSeqs = body.relatedDeviceSeqs === undefined
      ? body.relatedDeviceMappings === undefined
        ? undefined
        : normalizeRelatedDeviceSeqs(
            Array.isArray(body.relatedDeviceMappings)
              ? body.relatedDeviceMappings.map((item: { deviceSeq?: unknown }) => item?.deviceSeq)
              : [],
            body.device ?? existing.deviceSeq ?? existing.device
          )
      : normalizeRelatedDeviceSeqs(body.relatedDeviceSeqs, body.device ?? existing.deviceSeq ?? existing.device);
    if (relatedDeviceSeqs === null) {
      return fail(`Danh sách thiết bị liên quan không hợp lệ hoặc vượt quá ${MAX_DEFECT_RELATED_DEVICES} thiết bị`);
    }
    const defectUnit = String(body.unit ?? existing.unit ?? "");
    const mappedDeviceUnit = body.mappedDeviceUnit !== undefined
      ? normalizeMappedUnit(body.mappedDeviceUnit, defectUnit, body.device ?? existing.deviceSeq)
      : normalizeMappedUnit(existing.mappedDeviceUnit, defectUnit, existing.deviceSeq);
    const rawRelatedMappings = Array.isArray(body.relatedDeviceMappings)
      ? body.relatedDeviceMappings as Array<{ deviceSeq?: unknown; mappedUnit?: unknown }>
      : [];
    const relatedDeviceMappings: DefectDeviceMapping[] | undefined = relatedDeviceSeqs?.map((deviceSeq) => {
      const raw = rawRelatedMappings.find((item) => String(item?.deviceSeq ?? "").trim() === deviceSeq);
      return {
        deviceSeq,
        mappedUnit: normalizeMappedUnit(raw?.mappedUnit, defectUnit, deviceSeq),
      };
    });
    const primarySeq = body.device !== undefined
      ? String(body.device ?? "").trim()
      : existing.deviceSeq ?? "";
    const mappingFieldsRequested =
      body.deviceSystemSeq !== undefined
      || body.device !== undefined
      || body.relatedDeviceSeqs !== undefined
      || body.relatedDeviceMappings !== undefined
      || body.mappedDeviceUnit !== undefined;
    if (primarySeq && mappingFieldsRequested) {
      const mappingError = validateMappedDevice(primarySeq, mappedDeviceUnit, defectUnit);
      if (mappingError) return fail(mappingError);
    }
    for (const mapping of relatedDeviceMappings ?? []) {
      const mappingError = validateMappedDevice(mapping.deviceSeq, mapping.mappedUnit, defectUnit);
      if (mappingError) return fail(mappingError);
    }
    if (isInitialSheetMapping) {
      // Quyền xem phiếu chưa ánh xạ đã bao gồm quan hệ quản lý (Trưởng ca,
      // Trưởng kíp, Lò trưởng, Máy trưởng). Cho phép các cương vị đó thực hiện
      // ánh xạ lần đầu, nhưng chỉ vào các nhánh thiết bị họ được phép xem.
      if (!canViewUnmappedDefectPosition(existing.system, user.currentPosition ?? user.position)) {
        return fail("Cương vị của bạn không có quyền ánh xạ phiếu khiếm khuyết này", 403);
      }
      const access = await resolveEquipmentAccessForUser(user);
      const requestedSeqs = [
        body.device === undefined ? null : String(body.device ?? "").trim(),
        ...(relatedDeviceSeqs ?? []),
      ].filter((seq): seq is string => !!seq);
      if (access.hasExplicitScopes && requestedSeqs.some((seq) => !access.canViewSeq(seq))) {
        return fail("Thiết bị được chọn nằm ngoài phạm vi quản lý của cương vị", 403);
      }
    } else {
      if (existing.deviceSeq) await assertSeqEditable(user, existing.deviceSeq);
      if (body.device) await assertSeqEditable(user, String(body.device));
      if (relatedDeviceSeqs) {
        await Promise.all(relatedDeviceSeqs.map((seq) => assertSeqEditable(user, seq)));
      }
    }
    if (relatedDeviceSeqs) {
      const existingRelatedCount = await prisma.equipmentNode.count({ where: { seq: { in: relatedDeviceSeqs } } });
      if (existingRelatedCount !== relatedDeviceSeqs.length) return fail("Có thiết bị liên quan không tồn tại");
    }
    if (existing.sourceType === "GOOGLE_SHEETS" && !existing.websiteCreated) {
      const mappingRequested = mappingFieldsRequested;
      const requestedDeviceSeq = String(body.device ?? "").trim();
      const requestedSystemSeq = String(body.deviceSystemSeq ?? "").trim();
      if (mappingRequested && !requestedSystemSeq) return fail("Vui lòng chọn Hệ thống trước khi lưu ánh xạ");
      if (mappingRequested && !requestedDeviceSeq) return fail("Vui lòng chọn Thiết bị chính trước khi lưu ánh xạ");
      const severity = body.severity === undefined ? undefined : String(body.severity);
      if (severity !== undefined && !["1", "2", "3", "4"].includes(severity)) {
        return fail("Mức độ khiếm khuyết không hợp lệ");
      }
      const status = body.status === undefined ? undefined : String(body.status);
      if (
        status !== undefined
        && !["CHUA_XU_LY", "CO_PCT", "CHO_VAT_TU", "CHO_NGUNG_MAY", "DA_XU_LY"].includes(status)
      ) {
        return fail("KQ Vận hành không hợp lệ");
      }
      const condition = body.condition === undefined ? undefined : String(body.condition).toUpperCase();
      if (condition !== undefined && !["A", "B"].includes(condition)) {
        return fail("Điều kiện thực hiện không hợp lệ");
      }
      const fireSafetyImpact =
        body.fireSafetyImpact === undefined ? undefined : normalizeImpactValue(body.fireSafetyImpact);
      const environmentSafetyImpact =
        body.environmentSafetyImpact === undefined ? undefined : normalizeImpactValue(body.environmentSafetyImpact);
      const note = body.note === undefined ? undefined : String(body.note ?? "").trim();
      if (
        existing.status === "DA_XU_LY"
        && (
          (severity !== undefined && severity !== existing.severity)
          || (status !== undefined && status !== existing.status)
          || (condition !== undefined && condition !== existing.condition)
          || (fireSafetyImpact !== undefined && fireSafetyImpact !== existing.fireSafetyImpact)
          || (environmentSafetyImpact !== undefined && environmentSafetyImpact !== existing.environmentSafetyImpact)
        )
      ) {
        return fail("Phiếu đã xử lý xong, chỉ được phép thay đổi Ghi chú");
      }

      const equipmentNodes = mappingRequested ? await prisma.equipmentNode.findMany({
        select: { seq: true, parentSeq: true },
      }) : [];
      const parentBySeq = new Map(equipmentNodes.map((node) => [node.seq, node.parentSeq]));
      const seqsWithChildren = new Set(
        equipmentNodes.map((node) => node.parentSeq).filter((seq): seq is string => !!seq)
      );
      if (mappingRequested && !parentBySeq.has(requestedSystemSeq)) return fail("Hệ thống đã chọn không tồn tại");
      if (mappingRequested && !parentBySeq.has(requestedDeviceSeq)) return fail("Thiết bị đã chọn không tồn tại");
      if (mappingRequested && seqsWithChildren.has(requestedDeviceSeq)) {
        return fail("Thiết bị chính phải là thiết bị cấp cuối trong Hệ thống");
      }
      if (relatedDeviceSeqs?.some((seq) => seqsWithChildren.has(seq))) {
        return fail("Thiết bị liên quan phải là thiết bị cấp cuối trong Hệ thống");
      }

      function belongsToSelectedSystem(seq: string) {
        let cursor: string | null = seq;
        while (cursor) {
          if (cursor === requestedSystemSeq) return true;
          cursor = parentBySeq.get(cursor) ?? null;
        }
        return false;
      }
      if (mappingRequested && !belongsToSelectedSystem(requestedDeviceSeq)) {
        return fail("Thiết bị chính không thuộc Hệ thống đang ánh xạ");
      }

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
      const operationalChanged =
        (severity !== undefined && severity !== existing.severity)
        || (status !== undefined && status !== existing.status)
        || (condition !== undefined && condition !== existing.condition)
        || (fireSafetyImpact !== undefined && fireSafetyImpact !== existing.fireSafetyImpact)
        || (environmentSafetyImpact !== undefined && environmentSafetyImpact !== existing.environmentSafetyImpact)
        || (note !== undefined && note !== (existing.note ?? ""));
      if (operationalChanged && !existing.deviceSeq && !requestedDeviceSeq) {
        return fail("Vui lòng ánh xạ thiết bị trước khi cập nhật Vận hành");
      }
      const defect = await prisma.$transaction(async (tx) => {
        const updated = await tx.defect.update({
          where: { id: params.id },
          data: {
          createdById: user.id,
          device: mappingRequested && body.device !== undefined ? body.device || null : undefined,
          deviceSeq,
          mappedDeviceUnit: mappingRequested ? mappedDeviceUnit : undefined,
          severity,
          status,
          condition,
          fireSafetyImpact,
          environmentSafetyImpact,
          note,
          completedAt:
            status === "DA_XU_LY" && existing.status !== "DA_XU_LY"
              ? new Date()
              : status !== undefined && status !== "DA_XU_LY" && existing.status === "DA_XU_LY"
                ? null
                : undefined,
          postRepairAwaitingMaterial:
            existing.status === "DA_XU_LY" && typeof body.postRepairAwaitingMaterial === "boolean"
              ? body.postRepairAwaitingMaterial
              : undefined,
          images,
          imageUrl: images ? null : undefined,
          relatedDevices: relatedDeviceSeqs
            ? {
                deleteMany: {},
                create: (relatedDeviceMappings ?? []).map(({ deviceSeq, mappedUnit }) => ({ deviceSeq, mappedUnit })),
              }
            : undefined,
          },
          include: INCLUDE,
        });
        if (operationalChanged) {
          await enqueueDefectSyncEvent(tx, {
            defect: updated,
            eventType: "UPDATE",
            extra: { writeScope: "SHEET_ORIGIN_LIMITED" },
          });
        }
        if (status !== undefined && status !== "DA_XU_LY") {
          await tx.defectHistoryPending.deleteMany({ where: { defectId: updated.id } });
          await tx.defect.update({
            where: { id: updated.id },
            data: {
              confirmedAt: null,
              confirmedById: null,
              confirmedByName: null,
              confirmedHistoryId: null,
            },
          });
        }
        return updated;
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
    const commonSubUnit = body.unit !== undefined
      ? (body.unit === "COMMON" ? String(body.commonSubUnit ?? "").trim() : null)
      : undefined;
    if (body.unit === "COMMON" && !DEFECT_COMMON_SUB_UNITS.includes(commonSubUnit as (typeof DEFECT_COMMON_SUB_UNITS)[number])) {
      return fail("Vui lòng chọn BOP hoặc CHUNG");
    }
    const nextStatus = body.status !== undefined ? String(body.status) : existing.status;
    const completedAt =
      nextStatus === "DA_XU_LY" && existing.status !== "DA_XU_LY"
        ? new Date()
        : nextStatus !== "DA_XU_LY" && existing.status === "DA_XU_LY"
          ? null
          : undefined;
    const defect = await prisma.$transaction(async (tx) => {
      const updated = await tx.defect.update({
        where: { id: params.id },
        data: {
          createdById: user.id,
          unit: body.unit,
          commonSubUnit,
          device: body.device !== undefined ? body.device || null : undefined,
          deviceSeq,
          mappedDeviceUnit: body.device !== undefined || body.mappedDeviceUnit !== undefined
            ? mappedDeviceUnit
            : undefined,
          system: body.system !== undefined ? body.system || null : undefined,
          positionCode: body.system !== undefined ? positionCodeOf(body.system) : undefined,
          severity: body.severity !== undefined ? body.severity || null : undefined,
          severityCriteria:
            body.severity !== undefined || body.severityCriteria !== undefined
              ? normalizeDefectSeverityCriteria(body.severity ?? existing.severity, body.severityCriteria ?? existing.severityCriteria)
              : undefined,
          condition: body.condition !== undefined ? body.condition || null : undefined,
          requestType: body.requestType !== undefined ? body.requestType || null : undefined,
          // Số yêu cầu không cho sửa qua API — chỉ hệ thống tự cấp lúc tạo mới.
          content: body.content !== undefined ? content : undefined,
          repeatedRepairRaw: body.repeatedRepairRaw !== undefined ? body.repeatedRepairRaw?.trim() || null : undefined,
          sourceDeviceRaw: body.sourceDeviceRaw !== undefined ? body.sourceDeviceRaw?.trim() || null : undefined,
          status: body.status,
          completedAt,
          detectedAt: body.detectedAt !== undefined ? (body.detectedAt ? parseDateInput(body.detectedAt) : null) : undefined,
          // Không nhận sửa tay bộ đếm/ngày nhắc lại. Hai trường này chỉ được
          // cập nhật nguyên tử cùng DefectReminderLog tại API /remind.
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
                create: (relatedDeviceMappings ?? []).map(({ deviceSeq, mappedUnit }) => ({ deviceSeq, mappedUnit })),
              }
            : undefined,
        },
        include: INCLUDE,
      });
      await enqueueDefectSyncEvent(tx, { defect: updated, eventType: "UPDATE" });
      return updated;
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
    await requirePermissionLevel(user, "defect-delete", ["full"], "Không đủ quyền xoá phiếu khiếm khuyết");
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
