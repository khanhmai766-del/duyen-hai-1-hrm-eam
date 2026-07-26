import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
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
import { normalizeText } from "@/lib/nav";
import { announcementPositionLabel } from "@/lib/positions";

export const dynamic = "force-dynamic";

// Tầng 4: avatar trong list đi qua publicUserRef (proxy theo key) — không chở base64.
const INCLUDE = {
  createdBy: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true } },
  node: { select: { seq: true, name: true } },
  relatedDevices: {
    select: { deviceSeq: true, device: { select: { seq: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

const LIST_SELECT = {
  id: true,
  unit: true,
  deviceSeq: true,
  device: true,
  system: true,
  severity: true,
  requestType: true,
  requestNumber: true,
  content: true,
  status: true,
  detectedAt: true,
  sourceType: true,
  syncState: true,
  postRepairAwaitingMaterial: true,
  sourceStatusMismatch: true,
  repairResultRaw: true,
  note: true,
  createdAt: true,
  createdBy: { select: { name: true } },
  relatedDevices: {
    select: { deviceSeq: true, device: { select: { name: true } } },
  },
} satisfies Prisma.DefectSelect;

function activeDefectWhere(): Prisma.DefectWhereInput {
  return {
    OR: [
      { sourceType: "GOOGLE_SHEETS", syncState: { not: "CONFIRMED" } },
      { sourceType: { not: "GOOGLE_SHEETS" }, status: { not: "DA_XU_LY" } },
    ],
  };
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const access = await resolveEquipmentAccessForUser(user);
    const params = req.nextUrl.searchParams;
    const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
    const maxLimit = params.get("export") === "1" ? 20_000 : 100;
    const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(params.get("limit") ?? "25", 10) || 25));
    const unit = params.get("unit")?.trim();
    const requestType = params.get("requestType")?.trim();
    const position = params.get("position")?.trim();
    const mapping = params.get("mapping")?.trim();
    const status = params.get("status")?.trim();
    const severity = params.get("severity")?.trim();
    const deviceSeq = params.get("deviceSeq")?.trim();
    const query = normalizeText(params.get("q")?.trim() ?? "");

    // Lọc quyền theo cương vị NGAY TRONG SQL bằng prefix nhánh cây (index text_pattern_ops);
    // phiếu chưa gắn thiết bị (deviceSeq null) vẫn lấy về, xét tiếp bằng rule text bên dưới.
    const scopeWhere = equipmentSeqWhere(access.branchFilter, "deviceSeq");
    const where: Prisma.DefectWhereInput = {
      AND: [
        activeDefectWhere(),
        ...(scopeWhere ? [{ OR: [scopeWhere, { deviceSeq: null }] } as Prisma.DefectWhereInput] : []),
        ...(unit ? [{ unit }] : []),
        ...(requestType && requestType !== "ALL" ? [{ requestType }] : []),
        ...(mapping === "MAPPED"
          ? [{ sourceType: "GOOGLE_SHEETS", deviceSeq: { not: null } }]
          : mapping === "UNMAPPED"
            ? [{ sourceType: "GOOGLE_SHEETS", deviceSeq: null }]
            : []),
        ...(deviceSeq
          ? [{
              OR: [
                { deviceSeq },
                { AND: [{ deviceSeq: null }, { device: deviceSeq }] },
                { relatedDevices: { some: { deviceSeq } } },
              ],
            } as Prisma.DefectWhereInput]
          : []),
      ],
    };

    // Chỉ lấy tập trường nhẹ để lọc/đếm/sắp xếp. Quan hệ đầy đủ chỉ tải cho trang hiện tại.
    const [candidates, scopeTotal] = await Promise.all([
      prisma.defect.findMany({
        where,
        select: LIST_SELECT,
      }),
      prisma.defect.count({
        where: {
          AND: [
            activeDefectWhere(),
            ...(scopeWhere ? [{ OR: [scopeWhere, { deviceSeq: null }] } as Prisma.DefectWhereInput] : []),
          ],
        },
      }),
    ]);

    const base = candidates
      .filter(
        (defect) =>
          !access.hasExplicitScopes ||
          // Có deviceSeq → đã qua lọc SQL; chỉ phiếu chưa gắn thiết bị mới xét rule text cũ.
          !!defect.deviceSeq ||
          access.canViewDeviceLike({ device: defect.device, system: defect.system })
      )
      .filter(
        (defect) =>
          !position ||
          position === "ALL" ||
          normalizeText(announcementPositionLabel(defect.system)) ===
            normalizeText(announcementPositionLabel(position))
      );

    const kpi = {
      chuaXuLy: base.filter((item) => item.status === "CHUA_XU_LY").length,
      coPct: base.filter((item) => item.status === "CO_PCT").length,
      choVatTu: base.filter((item) => item.status === "CHO_VAT_TU").length,
      tonDong: base.filter((item) => item.postRepairAwaitingMaterial).length,
      daXuLy: base.filter((item) => item.status === "DA_XU_LY" && !item.postRepairAwaitingMaterial).length,
    };

    const filtered = base
      .filter((item) => {
        if (status && status !== "ALL") {
          if (status === "SOURCE_MISSING") {
            if (!(item.sourceType === "GOOGLE_SHEETS" && item.syncState === "MISSING")) return false;
          } else if (status === "TON_DONG") {
            if (!item.postRepairAwaitingMaterial) return false;
          } else if (status === "DA_XU_LY") {
            if (!(item.status === "DA_XU_LY" && !item.postRepairAwaitingMaterial)) return false;
          } else if (item.status !== status) {
            return false;
          }
        }
        if (severity && severity !== "ALL" && item.severity !== severity) return false;
        if (!query) return true;
        return normalizeText([
          item.requestNumber,
          item.requestType,
          item.unit,
          item.system,
          item.device,
          ...item.relatedDevices.flatMap((related) => [related.deviceSeq, related.device.name]),
          item.content,
          item.repairResultRaw,
          item.note,
          item.createdBy?.name,
        ].filter(Boolean).join(" ")).includes(query);
      })
      .sort((a, b) => {
        if (a.sourceStatusMismatch !== b.sourceStatusMismatch) return a.sourceStatusMismatch ? -1 : 1;
        const unmappedA = a.sourceType === "GOOGLE_SHEETS" && !a.deviceSeq;
        const unmappedB = b.sourceType === "GOOGLE_SHEETS" && !b.deviceSeq;
        if (unmappedA !== unmappedB) return unmappedA ? -1 : 1;
        const detectedA = a.detectedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
        const detectedB = b.detectedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
        return detectedB - detectedA || b.createdAt.getTime() - a.createdAt.getTime();
      });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const ids = filtered.slice((safePage - 1) * limit, safePage * limit).map((item) => item.id);
    const pageRows = ids.length
      ? await prisma.defect.findMany({ where: { id: { in: ids } }, include: INCLUDE })
      : [];
    const byId = new Map(pageRows.map((item) => [item.id, item]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((item): item is NonNullable<typeof item> => !!item)
      .map((defect) => ({ ...defect, createdBy: publicUserRef(defect.createdBy) }));

    return ok(data, {
      total,
      page: safePage,
      limit,
      totalPages,
      scopeTotal,
      kpi,
    });
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
