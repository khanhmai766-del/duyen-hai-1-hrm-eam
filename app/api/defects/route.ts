import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { assertSeqEditable, equipmentSeqWhere, resolveEquipmentAccessForUser } from "@/lib/server-access";
import { normalizeImpactValue } from "@/lib/defect-impact-fields";
import { maybeUploadDataUrlList, publicUserRef } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { parseDateInput } from "@/lib/utils";
import { resolveDefectShiftLeader } from "@/lib/defect-shift-leader";
import { normalizeDefectSeverityCriteria } from "@/lib/constants";
import { validateDefectImages } from "@/lib/defect-images";
import { parseReminderCount } from "@/lib/defect-reminder";
import { MAX_DEFECT_RELATED_DEVICES, normalizeRelatedDeviceSeqs } from "@/lib/defect-related-devices";

export const dynamic = "force-dynamic";

// Tầng 4: avatar trong list đi qua publicUserRef (proxy theo key) — không chở base64.
const INCLUDE = {
  createdBy: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true } },
  relatedDevices: {
    select: { deviceSeq: true, device: { select: { seq: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const access = await resolveEquipmentAccessForUser(user);
    // Lọc quyền theo cương vị NGAY TRONG SQL bằng prefix nhánh cây (index text_pattern_ops);
    // phiếu chưa gắn thiết bị (deviceSeq null) vẫn lấy về, xét tiếp bằng rule text bên dưới.
    const scopeWhere = equipmentSeqWhere(access.branchFilter, "deviceSeq");
    const defects = await prisma.defect.findMany({
      where: {
        // Ẩn ngay phiếu đã xác nhận/hoàn thành; lịch sử được lưu ở DefectHistory.
        // Phiếu Google Sheet đã báo xử lý nhưng chưa được VHV xác nhận vẫn hiển thị.
        OR: [
          {
            sourceType: "GOOGLE_SHEETS",
            syncState: { not: "CONFIRMED" },
          },
          {
            sourceType: { not: "GOOGLE_SHEETS" },
            status: { not: "DA_XU_LY" },
          },
        ],
        ...(scopeWhere ? { AND: [{ OR: [scopeWhere, { deviceSeq: null }] }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: INCLUDE,
    });
    // Cột fireSafetyImpact/environmentSafetyImpact đã thuộc model Defect nên có sẵn trong kết quả.
    const data = defects
      .filter(
        (defect) =>
          !access.hasExplicitScopes ||
          // Có deviceSeq → đã qua lọc SQL; chỉ phiếu chưa gắn thiết bị mới xét rule text cũ.
          !!defect.deviceSeq ||
          access.canViewDeviceLike({ device: defect.device, system: defect.system })
      )
      .map((defect) => ({ ...defect, createdBy: publicUserRef(defect.createdBy) }));
    return ok(data, { total: data.length });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-manage", ["create", "manage", "full"], "Không đủ quyền ghi nhận khiếm khuyết");
    const body = await req.json();

    if (!body.unit) return fail("Vui lòng chọn tổ máy");
    const reminderCount = body.reminderCount === undefined ? 0 : parseReminderCount(body.reminderCount);
    if (reminderCount === null) return fail("Số lần nhắc lại phải là số nguyên không âm");
    const relatedDeviceSeqs = normalizeRelatedDeviceSeqs(body.relatedDeviceSeqs, body.device);
    if (relatedDeviceSeqs === null) {
      return fail(`Danh sách thiết bị liên quan không hợp lệ hoặc vượt quá ${MAX_DEFECT_RELATED_DEVICES} thiết bị`);
    }
    if (!String(body.shiftLeaderId ?? "").trim()) return fail("Vui lòng chọn Trưởng ca");
    if (body.device) await assertSeqEditable(user, String(body.device));
    await Promise.all(relatedDeviceSeqs.map((seq) => assertSeqEditable(user, seq)));
    if (relatedDeviceSeqs.length > 0) {
      const existingRelatedCount = await prisma.equipmentNode.count({ where: { seq: { in: relatedDeviceSeqs } } });
      if (existingRelatedCount !== relatedDeviceSeqs.length) return fail("Có thiết bị liên quan không tồn tại");
    }
    const shiftLeader = await resolveDefectShiftLeader(body.shiftLeaderId);
    if (!shiftLeader) return fail("Nhân viên được chọn không có cương vị Trưởng ca hoặc đã ngừng hoạt động");
    const rawImages = Array.isArray(body.images) ? body.images.filter(Boolean) : [];
    const imageError = validateDefectImages(rawImages);
    if (imageError) return fail(imageError);
    if (rawImages.length > 0 && !["1", "2"].includes(String(body.severity ?? ""))) {
      return fail("Chỉ khiếm khuyết Mức 1 hoặc Mức 2 mới được thêm ảnh");
    }
    const images = await maybeUploadDataUrlList(rawImages, "defects/images", "image");

    // Khóa liên kết chuẩn với cây: chỉ gán khi "device" là seq có thật (FK không chặn giá trị lạ).
    const deviceSeq = body.device
      ? (await prisma.equipmentNode.findUnique({ where: { seq: String(body.device) }, select: { seq: true } }))?.seq ?? null
      : null;

    const defect = await prisma.defect.create({
      data: {
        unit: body.unit,
        device: body.device || null,
        deviceSeq,
        system: body.system || null,
        severity: body.severity || null,
        severityCriteria: normalizeDefectSeverityCriteria(body.severity, body.severityCriteria),
        condition: body.condition || null,
        requestType: body.requestType || null,
        requestNumber: body.requestNumber?.trim() || null,
        content: body.content?.trim() || null,
        status: body.status || "CHUA_XU_LY",
        detectedAt: body.detectedAt ? parseDateInput(body.detectedAt) : null,
        reminderCount,
        lastRemindedAt: reminderCount > 0 && body.lastRemindedAt ? parseDateInput(body.lastRemindedAt) : null,
        shiftLeaderId: shiftLeader?.id ?? null,
        shiftLeaderName: shiftLeader?.name ?? null,
        note: body.note?.trim() || null,
        images,
        fireSafetyImpact: normalizeImpactValue(body.fireSafetyImpact),
        environmentSafetyImpact: normalizeImpactValue(body.environmentSafetyImpact),
        createdById: user.id,
        relatedDevices: {
          create: relatedDeviceSeqs.map((deviceSeq) => ({ deviceSeq })),
        },
      },
      include: INCLUDE,
    });
    await audit(user.id, "CREATE_DEFECT", "Defect", defect.id, auditDetailWithPosition(user));
    return ok({ ...defect, createdBy: publicUserRef(defect.createdBy) });
  });
}
