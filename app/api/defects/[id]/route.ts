import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { assertSeqEditable, resolveEquipmentAccessForUser } from "@/lib/server-access";
import { normalizeImpactValue } from "@/lib/defect-impact-fields";
import { deleteFromS3, keyFromPublicUrl, maybeUploadDataUrlList, publicFileRef, publicFileRefs, publicUserRef } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { parseDateInput } from "@/lib/utils";
import { resolveDefectShiftLeader } from "@/lib/defect-shift-leader";
import { DEFECT_COMMON_SUB_UNITS, normalizeDefectSeverityCriteria } from "@/lib/constants";
import { validateDefectImages } from "@/lib/defect-images";
import { MAX_DEFECT_RELATED_DEVICES, normalizeRelatedDeviceSeqs } from "@/lib/defect-related-devices";
import { enqueueDefectSyncEvent } from "@/lib/defect-sync-outbox";
import { canViewPosition, resolvePositionViewScope } from "@/lib/position-data-scope";
import { positionCodeOf } from "@/lib/position-catalog";
import { revertMaterialRequestReplacements } from "@/lib/defect-material-request";
import {
  normalizeMappedUnit,
  validateMappedDevice,
  type DefectDeviceMapping,
} from "@/lib/defect-device-mapping";
import { isDefectSyncFeatureEnabled } from "@/lib/defect-two-way-sync";
import { normalizeText } from "@/lib/nav";

function sourceKeyWithCorrectedDevice(sourceKey: string | null, sourceDeviceRaw: string) {
  if (!sourceKey) return undefined;
  const parts = sourceKey.split("|");
  if (parts.length !== 8) return undefined;
  parts[7] = normalizeText(sourceDeviceRaw);
  return parts.join("|");
}

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

    // Rào cương vị áp cho MỌI phiếu — cùng luật với danh sách (lib/position-data-scope.ts).
    // Không có rào này thì mở thẳng URL /khiem-khuyet/<id> là xem được phiếu của cương
    // vị khác, dù danh sách đã lọc.
    const viewScope = await resolvePositionViewScope(user, "defect");
    if (!canViewPosition(defect.system, viewScope)) {
      return fail("Cương vị của bạn không có quyền xem phiếu khiếm khuyết này", 403);
    }

    // Rào thứ hai, giao với rào trên: phạm vi cây thiết bị. Phiếu chưa gắn thiết bị
    // không có seq để xét nên chỉ chịu rào cương vị.
    const access = await resolveEquipmentAccessForUser(user);
    if (access.hasExplicitScopes && defect.deviceSeq && !access.canViewSeq(defect.deviceSeq)) {
      return fail("Cương vị của bạn không có quyền xem phiếu khiếm khuyết này", 403);
    }

    return ok({
      ...defect,
      createdBy: publicUserRef(defect.createdBy),
      // Ảnh lưu URL S3 gốc; bucket không mở đọc ẩn danh nên phải trả về đường proxy,
      // nếu không thẻ <img> nhận 403 và hiện ảnh vỡ (xem lib/s3.ts publicFileRef).
      images: publicFileRefs(defect.images),
      imageUrl: publicFileRef(defect.imageUrl),
    });
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
      "status",
      "fireSafetyImpact",
      "environmentSafetyImpact",
      "condition",
      "note",
      "images",
      "postRepairAwaitingMaterial",
      "content",
      "sourceDeviceRaw",
      "repeatedRepairRaw",
    ];
    if (
      !operationUpdateAvailable
      && operationFields.some((field) => body[field] !== undefined)
    ) {
      return fail("Cập nhật Vận hành đang tạm khóa; bạn vẫn có thể gắn thiết bị", 503);
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
      if (!canViewPosition(existing.system, await resolvePositionViewScope(user, "defect"))) {
        return fail("Cương vị của bạn không có quyền gắn thiết bị cho phiếu khiếm khuyết này", 403);
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
      if (mappingRequested && !requestedSystemSeq) return fail("Vui lòng chọn Hệ thống trước khi gắn thiết bị");
      if (mappingRequested && !requestedDeviceSeq) return fail("Vui lòng chọn Thiết bị chính trước khi gắn");
      const severity = body.severity === undefined ? undefined : String(body.severity);
      if (severity !== undefined && !["1", "2", "3", "4"].includes(severity)) {
        return fail("Mức độ khiếm khuyết không hợp lệ");
      }
      const severityCriteria = body.severityCriteria === undefined
        ? undefined
        : normalizeDefectSeverityCriteria(
            severity ?? existing.severity,
            body.severityCriteria
          );
      if (
        body.severityCriteria !== undefined
        && existing.status !== "DA_XU_LY"
        && severityCriteria?.length === 0
      ) {
        return fail("Vui lòng chọn ít nhất 1 tiêu chí mức độ");
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
      const sourceDeviceRaw = body.sourceDeviceRaw === undefined
        ? undefined
        : String(body.sourceDeviceRaw ?? "").trim();
      const sourceContent = body.content === undefined
        ? undefined
        : String(body.content ?? "").trim();
      const repeatedRepairRaw = body.repeatedRepairRaw === undefined
        ? undefined
        : String(body.repeatedRepairRaw ?? "").trim();
      if (sourceDeviceRaw !== undefined && !sourceDeviceRaw) {
        return fail("Vui lòng nhập Thiết bị cột 3");
      }
      if (sourceContent !== undefined && !sourceContent) {
        return fail("Vui lòng nhập Nội dung khiếm khuyết");
      }
      if (
        existing.status === "DA_XU_LY"
        && (
          (severity !== undefined && severity !== existing.severity)
          || (condition !== undefined && condition !== existing.condition)
          || (fireSafetyImpact !== undefined && fireSafetyImpact !== existing.fireSafetyImpact)
          || (environmentSafetyImpact !== undefined && environmentSafetyImpact !== existing.environmentSafetyImpact)
        )
      ) {
        return fail("Phiếu đã xử lý xong, chỉ được phép thay đổi KQ Vận hành và Ghi chú");
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
        return fail("Thiết bị chính không thuộc Hệ thống đã chọn");
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
      const sourceCorrectionChanged =
        (sourceDeviceRaw !== undefined && sourceDeviceRaw !== (existing.sourceDeviceRaw ?? ""))
        || (sourceContent !== undefined && sourceContent !== (existing.content ?? ""))
        || (repeatedRepairRaw !== undefined && repeatedRepairRaw !== (existing.repeatedRepairRaw ?? ""));
      const defect = await prisma.$transaction(async (tx) => {
        const updated = await tx.defect.update({
          where: { id: params.id },
          data: {
          createdById: user.id,
          device: mappingRequested && body.device !== undefined ? body.device || null : undefined,
          deviceSeq,
          mappedDeviceUnit: mappingRequested ? mappedDeviceUnit : undefined,
          severity,
          severityCriteria,
          status,
          condition,
          fireSafetyImpact,
          environmentSafetyImpact,
          note,
          sourceDeviceRaw: sourceDeviceRaw !== undefined ? sourceDeviceRaw : undefined,
          sourceKey: sourceDeviceRaw !== undefined && sourceDeviceRaw !== (existing.sourceDeviceRaw ?? "")
            ? sourceKeyWithCorrectedDevice(existing.sourceKey, sourceDeviceRaw)
            : undefined,
          content: sourceContent !== undefined ? sourceContent : undefined,
          repeatedRepairRaw: repeatedRepairRaw !== undefined ? repeatedRepairRaw || null : undefined,
          completedAt:
            status === "DA_XU_LY" && existing.status !== "DA_XU_LY"
              ? new Date()
              : status !== undefined && status !== "DA_XU_LY" && existing.status === "DA_XU_LY"
                ? null
                : undefined,
          postRepairAwaitingMaterial:
            status !== undefined && status !== "DA_XU_LY" && existing.status === "DA_XU_LY"
              ? false
              : existing.status === "DA_XU_LY" && typeof body.postRepairAwaitingMaterial === "boolean"
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
        if (operationalChanged || sourceCorrectionChanged) {
          await enqueueDefectSyncEvent(tx, {
            defect: updated,
            eventType: "UPDATE",
            extra: {
              writeScope: operationalChanged && sourceCorrectionChanged
                ? "SHEET_ORIGIN_WITH_CORRECTION"
                : sourceCorrectionChanged
                  ? "SOURCE_CORRECTION_ONLY"
                  : "SHEET_ORIGIN_LIMITED",
            },
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
          // Rút lại xác nhận thì phải rút lại cả lần "đã thay thế": gắn lại điểm
          // theo dõi và gỡ dòng lịch sử, nếu không điểm bị tiêu cho một lần thay
          // chưa từng được chốt.
          if (updated.isMaterialRequest) {
            await revertMaterialRequestReplacements(tx, { defectId: updated.id });
          }
        }
        return updated;
      });
      if (images) {
        // So bằng KEY chứ không bằng chuỗi: client nhận ảnh dưới dạng đường proxy
        // (/api/files/s3?key=…) nhưng DB lưu URL S3 gốc, so chuỗi thẳng sẽ coi mọi ảnh
        // giữ lại là đã gỡ và XOÁ SẠCH tệp trên S3.
        const retained = new Set(images.map((url) => keyFromPublicUrl(url) ?? url));
        await Promise.all(
          existingImages
            .filter((url) => !retained.has(keyFromPublicUrl(url) ?? url))
            .map((url) => deleteFromS3(url))
        );
      }
      await audit(user.id, "UPDATE_SYNCED_DEFECT_LOCAL_DATA", "Defect", defect.id, auditDetailWithPosition(user));
      return ok({
      ...defect,
      createdBy: publicUserRef(defect.createdBy),
      // Ảnh lưu URL S3 gốc; bucket không mở đọc ẩn danh nên phải trả về đường proxy,
      // nếu không thẻ <img> nhận 403 và hiện ảnh vỡ (xem lib/s3.ts publicFileRef).
      images: publicFileRefs(defect.images),
      imageUrl: publicFileRef(defect.imageUrl),
    });
    }
    if (body.shiftLeaderId !== undefined && !String(body.shiftLeaderId ?? "").trim()) {
      return fail("Vui lòng chọn Trưởng ca");
    }
    if (body.shiftLeaderId === undefined && !existing.shiftLeaderId) {
      return fail("Vui lòng chọn Trưởng ca");
    }
    if (body.requestType === "Hành Chính IT") {
      return fail("Loại yêu cầu Hành Chính IT đã ngừng sử dụng");
    }
    const nextSourceDeviceRaw = body.sourceDeviceRaw !== undefined
      ? String(body.sourceDeviceRaw ?? "").trim()
      : String(existing.sourceDeviceRaw ?? "").trim();
    if (!nextSourceDeviceRaw) {
      return fail(
        (body.requestType ?? existing.requestType) === "Môi Trường"
          ? "Vui lòng nhập Mã Trạm ghi lên Google Sheet"
          : "Vui lòng nhập Tên thiết bị ghi lên Google Sheet"
      );
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
      return fail("Vui lòng chọn BOP, CHUNG hoặc ĐKTT");
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
      // So bằng KEY — xem chú thích ở nhánh phiếu đồng bộ phía trên.
      const retained = new Set(images.map((url) => keyFromPublicUrl(url) ?? url));
      await Promise.all(
        existingImages
          .filter((url) => !retained.has(keyFromPublicUrl(url) ?? url))
          .map((url) => deleteFromS3(url))
      );
    }
    await audit(user.id, "UPDATE_DEFECT", "Defect", defect.id, auditDetailWithPosition(user));
    return ok({
      ...defect,
      createdBy: publicUserRef(defect.createdBy),
      // Ảnh lưu URL S3 gốc; bucket không mở đọc ẩn danh nên phải trả về đường proxy,
      // nếu không thẻ <img> nhận 403 và hiện ảnh vỡ (xem lib/s3.ts publicFileRef).
      images: publicFileRefs(defect.images),
      imageUrl: publicFileRef(defect.imageUrl),
    });
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
