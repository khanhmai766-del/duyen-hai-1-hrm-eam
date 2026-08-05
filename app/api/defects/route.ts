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
import { DEFECT_COMMON_SUB_UNITS, normalizeDefectSeverityCriteria } from "@/lib/constants";
import { validateDefectImages } from "@/lib/defect-images";
import { MAX_DEFECT_RELATED_DEVICES, normalizeRelatedDeviceSeqs } from "@/lib/defect-related-devices";
import { nextDefectRequestNumber } from "@/lib/defect-request-number";
import { resolveDefectEnvironmentSheetTarget } from "@/lib/defect-environment-sheet";
import { enqueueDefectSyncEvent } from "@/lib/defect-sync-outbox";
import { normalizeText } from "@/lib/nav";
import {
  announcementPositionLabel,
  announcementPositionsMatch,
  canViewUnmappedDefectPosition,
} from "@/lib/positions";
import { positionCodeOf } from "@/lib/position-catalog";
import {
  normalizeMappedUnit,
  validateMappedDevice,
  type DefectDeviceMapping,
} from "@/lib/defect-device-mapping";
import { getCachedEquipmentNodeFull } from "@/lib/equipment-node-cache";
import { getEquipmentSeqsWithinDepth } from "@/lib/equipment-tree";
import { daysSinceSecondReminder, isSeverity2UpgradeCandidate } from "@/lib/defect-severity-upgrade";
import { isDefectSyncFeatureEnabled } from "@/lib/defect-two-way-sync";
import { defectResultStatusOf } from "@/lib/defect-result-status";
import { resolveMaterialRequest, type ResolvedMaterialRequest } from "@/lib/defect-material-request";
import { DEFECT_SECTIONS, type DefectSectionKey } from "@/lib/defect-section";
import { N8N_DEFECT_SOURCE_SPREADSHEET_IDS } from "@/lib/defect-n8n-sync";

export const dynamic = "force-dynamic";

// Tầng 4: avatar trong list đi qua publicUserRef (proxy theo key) — không chở base64.
const INCLUDE = {
  createdBy: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true } },
  node: { select: { seq: true, name: true } },
  relatedDevices: {
    select: { deviceSeq: true, mappedUnit: true, device: { select: { seq: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  pendingHistory: {
    select: { startedAt: true, finalizeAt: true },
  },
};

const LIST_SELECT = {
  id: true,
  unit: true,
  deviceSeq: true,
  mappedDeviceUnit: true,
  device: true,
  system: true,
  severity: true,
  requestType: true,
  requestNumber: true,
  content: true,
  status: true,
  detectedAt: true,
  sourceType: true,
  websiteCreated: true,
  syncState: true,
  postRepairAwaitingMaterial: true,
  isMaterialRequest: true,
  cancelledAt: true,
  cancelledById: true,
  cancelledByName: true,
  sourceStatusMismatch: true,
  repairResultRaw: true,
  reminderCount: true,
  lastRemindedAt: true,
  reminderLogs: {
    orderBy: { occurredAt: "asc" as const },
    take: 2,
    select: { occurredAt: true },
  },
  ktatReviewRaw: true,
  boardDirectionRaw: true,
  note: true,
  createdAt: true,
  createdBy: { select: { name: true } },
  pendingHistory: { select: { startedAt: true, finalizeAt: true } },
  relatedDevices: {
    select: { deviceSeq: true, mappedUnit: true, device: { select: { name: true } } },
  },
} satisfies Prisma.DefectSelect;

const PAGE_SELECT = {
  ...LIST_SELECT,
  sourceStatusRaw: true,
  repairOrderNumberRaw: true,
  repairSolutionRaw: true,
  repairPlanRaw: true,
  repairUnitRaw: true,
  repairPerformedByRaw: true,
  repairStartedAt: true,
  sourceCompletedAt: true,
  repairPerformedContentRaw: true,
  repairNoteRaw: true,
  reminderCount: true,
  createdBy: {
    // Danh sách chỉ dùng avatar đã đưa lên object storage; không đọc lại base64 cũ
    // từ PostgreSQL vì payload này có thể lớn hàng MB.
    select: { id: true, name: true, position: true, avatarKey: true },
  },
  node: { select: { seq: true, name: true } },
  relatedDevices: {
    select: { deviceSeq: true, mappedUnit: true, device: { select: { seq: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.DefectSelect;

function activeDefectWhere(): Prisma.DefectWhereInput {
  const completedCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  return {
    AND: [{
      // Đã xác nhận lưu lịch sử thì phiếu chuyển hẳn sang trang Lịch sử sửa
      // chữa (hiện ở đó với trạng thái Chờ chốt), không còn nằm ở bảng Khiếm
      // khuyết nữa để tránh một phiếu xuất hiện ở hai nơi.
      pendingHistory: { is: null },
    }, {
      // Phiếu hủy chỉ còn ở Tồn đọng trong lúc chờ ACK ghi ngược lên Sheet.
      OR: [
        { cancelledAt: null },
        { syncState: { not: "CONFIRMED" } },
      ],
    }, {
      OR: [
      {
        sourceType: "GOOGLE_SHEETS",
        syncState: { not: "CONFIRMED" },
      },
      {
        sourceType: { not: "GOOGLE_SHEETS" },
        status: { not: "DA_XU_LY" },
      },
      // Phiếu còn chờ vật tư phải ở lại Tồn đọng cho đến khi VHV bỏ đánh dấu.
      { status: "DA_XU_LY", postRepairAwaitingMaterial: true },
      // Phiếu đã xử lý bình thường ở lại 14 ngày để VHV có thể xem lại.
      {
        sourceType: { not: "GOOGLE_SHEETS" },
        status: "DA_XU_LY",
        postRepairAwaitingMaterial: false,
        completedAt: { gte: completedCutoff },
      },
      ],
    }],
  };
}

function parseDefectRequestNumber(value: string | null) {
  const match = value?.trim().match(/^(\d+)\/(\d{4})$/);
  if (!match) return null;
  const sequence = Number.parseInt(match[1], 10);
  const year = Number.parseInt(match[2], 10);
  return Number.isSafeInteger(sequence) && Number.isSafeInteger(year)
    ? { sequence, year }
    : null;
}

function defectQueryTiming(startedAt: number, total: number) {
  const durationMs = Date.now() - startedAt;
  if (durationMs >= 750) {
    console.warn("[slow defect list]", { durationMs, total });
  }
  return durationMs;
}

function severityUpgradeInput<T extends {
  reminderCount: number;
  lastRemindedAt: Date | null;
  reminderLogs: Array<{ occurredAt: Date }>;
}>(defect: T) {
  return {
    ...defect,
    // Phiếu mới có đầy đủ log nên lấy chính xác lần thứ hai. Với dữ liệu nhắc cũ
    // chưa có log chi tiết, dùng lần nhắc gần nhất làm mốc bảo thủ, tránh gợi ý sớm.
    secondRemindedAt:
      defect.reminderLogs[1]?.occurredAt
      ?? (defect.reminderCount >= 2 ? defect.lastRemindedAt : null),
  };
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const queryStartedAt = Date.now();
    const user = await requireUser();
    const access = await resolveEquipmentAccessForUser(user);
    const params = req.nextUrl.searchParams;
    const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(params.get("limit") ?? "10", 10) || 10));
    const unit = params.get("unit")?.trim();
    const mappedUnit = params.get("mappedUnit")?.trim();
    const requestType = params.get("requestType")?.trim();
    // Phần Cơ / phần Điện = đúng hai Google Sheet nguồn. Phiếu tạo trên website chưa
    // đồng bộ vòng về thì chưa có sourceSpreadsheetId, nên nhận diện tạm theo loại
    // yêu cầu của phần đó — nếu không phiếu vừa lập sẽ biến mất khỏi danh sách.
    const section = params.get("section")?.trim().toLowerCase();
    const sectionConfig = section && section in DEFECT_SECTIONS
      ? DEFECT_SECTIONS[section as DefectSectionKey]
      : null;
    const sectionWhere: Prisma.DefectWhereInput | null = sectionConfig
      ? {
          OR: [
            { sourceSpreadsheetId: N8N_DEFECT_SOURCE_SPREADSHEET_IDS[sectionConfig.source] },
            { sourceSpreadsheetId: null, requestType: { in: [...sectionConfig.requestTypes] } },
          ],
        }
      : null;
    const position = params.get("position")?.trim();
    const mapping = params.get("mapping")?.trim();
    const status = params.get("status")?.trim();
    const severity = params.get("severity")?.trim();
    const mismatch = params.get("mismatch") === "true";
    const upgradeCandidate = params.get("upgradeCandidate") === "true";
    // "KQ sửa chữa" là chuỗi tự do đồng bộ từ Google Sheet (Đã thực hiện xong, Chờ vật tư,
    // Thuê ngoài…) nên lọc theo giá trị nguyên văn, không map sang enum.
    const repairResult = params.get("repairResult")?.trim();
    const deviceSeq = params.get("deviceSeq")?.trim();
    const descendantDepth = deviceSeq
      ? Math.min(3, Math.max(0, Number.parseInt(params.get("includeDescendants") ?? "0", 10) || 0))
      : 0;
    const deviceSeqs = deviceSeq && descendantDepth > 0
      ? [...getEquipmentSeqsWithinDepth(await getCachedEquipmentNodeFull(), deviceSeq, descendantDepth)]
      : deviceSeq ? [deviceSeq] : [];
    const query = normalizeText(params.get("q")?.trim() ?? "");

    // Lọc quyền theo cương vị NGAY TRONG SQL bằng prefix nhánh cây (index text_pattern_ops);
    // phiếu chưa gắn thiết bị (deviceSeq null) vẫn lấy về, xét tiếp bằng rule text bên dưới.
    const scopeWhere = equipmentSeqWhere(access.branchFilter, "deviceSeq");
    const where: Prisma.DefectWhereInput = {
      AND: [
        activeDefectWhere(),
        ...(scopeWhere ? [{ OR: [scopeWhere, { deviceSeq: null }] } as Prisma.DefectWhereInput] : []),
        ...(!deviceSeq && mappedUnit && ["S1", "S2", "COMMON"].includes(mappedUnit)
          ? [{
              OR: [
                { mappedDeviceUnit: mappedUnit },
                { mappedDeviceUnit: null, unit: mappedUnit },
                { relatedDevices: { some: { mappedUnit } } },
              ],
            } as Prisma.DefectWhereInput]
          : unit ? [{ unit }] : []),
        ...(sectionWhere ? [sectionWhere] : []),
        ...(requestType && requestType !== "ALL" ? [{ requestType }] : []),
        ...(mapping === "MAPPED"
          ? [{ sourceType: "GOOGLE_SHEETS", deviceSeq: { not: null } }]
          : mapping === "UNMAPPED"
            ? [{ sourceType: "GOOGLE_SHEETS", deviceSeq: null }]
            : []),
        ...(deviceSeq
          ? [{
              OR: [
                {
                  deviceSeq: { in: deviceSeqs },
                  ...(mappedUnit ? {
                    OR: [
                      { mappedDeviceUnit: mappedUnit },
                      { mappedDeviceUnit: null, unit: mappedUnit },
                    ],
                  } : {}),
                },
                ...(descendantDepth === 0 ? [{ AND: [{ deviceSeq: null }, { device: deviceSeq }] }] : []),
                ...(mappedUnit
                  ? [
                      { relatedDevices: { some: { deviceSeq: { in: deviceSeqs }, mappedUnit } } },
                      { unit: mappedUnit, relatedDevices: { some: { deviceSeq: { in: deviceSeqs }, mappedUnit: null } } },
                    ]
                  : [{ relatedDevices: { some: { deviceSeq: { in: deviceSeqs } } } }]),
              ],
            } as Prisma.DefectWhereInput]
          : []),
      ],
    };

    // Lấy tập trường nhẹ để có thể xếp số yêu cầu theo giá trị số (năm giảm dần,
    // STT giảm dần). PostgreSQL không thể xếp đúng "999/2026" và "1000/2026"
    // bằng thứ tự chuỗi thông thường; quan hệ đầy đủ vẫn chỉ tải cho trang hiện tại.
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
          (
            // Phiếu Google Sheets chưa ánh xạ chưa có deviceSeq chuẩn, nhưng Sheet
            // đã có cột Cương vị (lưu ở system), nên chỉ trả về đúng cương vị đang
            // làm việc. Sau khi ánh xạ, quyền xem bám theo cây thiết bị.
            defect.sourceType === "GOOGLE_SHEETS" &&
            !defect.deviceSeq
              ? canViewUnmappedDefectPosition(defect.system, user.currentPosition ?? user.position)
              // Có deviceSeq → đã qua lọc SQL; chỉ phiếu cũ chưa gắn thiết bị mới
              // xét rule text tương thích.
              : !!defect.deviceSeq ||
                access.canViewDeviceLike({ device: defect.device, system: defect.system })
          )
      )
      .filter(
        (defect) =>
          !position ||
          position === "ALL" ||
          announcementPositionsMatch(defect.system, position)
      )
      .map((defect) => {
        const repairStatus = defectResultStatusOf(defect.repairResultRaw);
        return {
          ...defect,
          sourceStatusMismatch: repairStatus !== null && repairStatus !== defect.status,
        };
      });

    const kpi = {
      chuaXuLy: base.filter((item) => item.status === "CHUA_XU_LY").length,
      coPct: base.filter((item) => item.status === "CO_PCT").length,
      choVatTu: base.filter((item) => item.status === "CHO_VAT_TU").length,
      choNgungMay: base.filter((item) => item.status === "CHO_NGUNG_MAY").length,
      tonDong: base.filter((item) => item.status === "DA_XU_LY").length,
    };

    // Danh sách "KQ sửa chữa" dựng từ tập trước khi áp bộ lọc KQ sửa chữa, xếp theo số lượng.
    const repairCount = new Map<string, number>();
    for (const item of base) {
      const value = item.repairResultRaw?.trim();
      if (value) repairCount.set(value, (repairCount.get(value) ?? 0) + 1);
    }
    const repairResults = [...repairCount.entries()].sort((a, b) => b[1] - a[1]).map(([value]) => value);
    const candidateNow = new Date();
    const upgradeCandidateTotal = base.filter((item) =>
      isSeverity2UpgradeCandidate(severityUpgradeInput(item), candidateNow)
    ).length;

    const filtered = base
      .filter((item) => {
        if (
          upgradeCandidate
          && !isSeverity2UpgradeCandidate(severityUpgradeInput(item), candidateNow)
        ) return false;
        if (status && status !== "ALL") {
          if (status === "SOURCE_MISSING") {
            if (!(item.sourceType === "GOOGLE_SHEETS" && item.syncState === "MISSING")) return false;
          } else if (status === "TON_DONG") {
            if (item.status !== "DA_XU_LY") return false;
          } else if (status === "DA_XU_LY") {
            if (item.status !== "DA_XU_LY") return false;
          } else if (item.status !== status) {
            return false;
          }
        }
        if (severity && severity !== "ALL" && item.severity !== severity) return false;
        if (repairResult && repairResult !== "ALL" && (item.repairResultRaw ?? "") !== repairResult) return false;
        if (mismatch && !item.sourceStatusMismatch) return false;
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
        if (upgradeCandidate) {
          const reminderDifference = b.reminderCount - a.reminderCount;
          if (reminderDifference !== 0) return reminderDifference;
          const ageDifference =
            daysSinceSecondReminder(severityUpgradeInput(b), candidateNow)
            - daysSinceSecondReminder(severityUpgradeInput(a), candidateNow);
          if (ageDifference !== 0) return ageDifference;
          if (a.severity !== b.severity) return a.severity === "3" ? -1 : 1;
        }
        const requestA = parseDefectRequestNumber(a.requestNumber);
        const requestB = parseDefectRequestNumber(b.requestNumber);
        if (requestA && requestB) {
          if (requestA.year !== requestB.year) return requestB.year - requestA.year;
          if (requestA.sequence !== requestB.sequence) return requestB.sequence - requestA.sequence;
        } else if (requestA || requestB) {
          return requestA ? -1 : 1;
        }
        const detectedA = a.detectedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
        const detectedB = b.detectedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
        return detectedB - detectedA || b.createdAt.getTime() - a.createdAt.getTime();
      });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const ids = filtered.slice((safePage - 1) * limit, safePage * limit).map((item) => item.id);
    const pageRows = ids.length
      ? await prisma.defect.findMany({ where: { id: { in: ids } }, select: PAGE_SELECT })
      : [];
    const byId = new Map(pageRows.map((item) => [item.id, item]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((item): item is NonNullable<typeof item> => !!item)
      .map((defect) => ({
        ...defect,
        severity2UpgradeCandidate: isSeverity2UpgradeCandidate(severityUpgradeInput(defect), candidateNow),
        severityUpgradeWaitingDays: daysSinceSecondReminder(severityUpgradeInput(defect), candidateNow),
        createdBy: publicUserRef(defect.createdBy),
      }));

    const durationMs = defectQueryTiming(queryStartedAt, total);
    return ok(data, {
      total,
      page: safePage,
      limit,
      totalPages,
      scopeTotal,
      upgradeCandidateTotal,
      kpi,
      repairResults,
      queryMode: "compatibility",
      durationMs,
    });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-manage", ["personal", "manage", "full"], "Không đủ quyền ghi nhận khiếm khuyết");
    if (!(await isDefectSyncFeatureEnabled("CREATE"))) {
      return fail("Tính năng thêm mới khiếm khuyết từ website đang tạm khóa", 503);
    }
    const body = await req.json();

    // SYC thay thế vật tư: client chỉ gửi danh sách id điểm khai báo. Server đọc lại
    // Danh mục và TỰ DỰNG LẠI tổ máy / cương vị / thiết bị, ghi đè mọi giá trị client
    // gửi kèm — nhờ vậy phiếu luôn trỏ đúng node đã khai báo, không thể ráng nhầm.
    // Điểm khai báo ở cấp THƯ MỤC vẫn được chấp nhận (chỉ riêng loại phiếu này).
    let materialRequest: ResolvedMaterialRequest | null = null;
    if (body.replacementIds !== undefined && body.replacementIds !== null) {
      const resolved = await resolveMaterialRequest(prisma, body.replacementIds);
      if (typeof resolved === "string") return fail(resolved);
      materialRequest = resolved;
      body.unit = resolved.unit;
      body.system = resolved.managingPosition ?? "";
      body.device = resolved.primarySeq;
      body.mappedDeviceUnit = resolved.unit;
      body.relatedDeviceSeqs = resolved.relatedSeqs;
      body.relatedDeviceMappings = resolved.relatedSeqs.map((deviceSeq) => ({
        deviceSeq,
        mappedUnit: resolved.unit,
      }));
      body.sourceDeviceRaw = resolved.primaryName;
      if (!String(body.content ?? "").trim()) body.content = resolved.suggestedContent;

      // Cảnh báo (không chặn) khi điểm đã có SYC còn dang dở — tránh ra trùng số cho
      // cùng một lần thay. Người dùng xác nhận thì gửi lại kèm allowDuplicate.
      if (!body.allowDuplicate) {
        const open = await prisma.defectMaterialRequest.findFirst({
          where: {
            replacementId: { in: resolved.rows.map((row) => row.replacementId) },
            defect: { status: { not: "DA_XU_LY" }, cancelledAt: null },
          },
          select: { pointLabel: true, defect: { select: { requestNumber: true } } },
        });
        if (open) {
          return fail(
            `Điểm "${open.pointLabel}" đã có số yêu cầu ${open.defect.requestNumber ?? "?"} chưa xử lý xong. Xác nhận để vẫn ra phiếu mới.`,
            409
          );
        }
      }
    }

    if (!body.unit) return fail("Vui lòng chọn tổ máy");
    const commonSubUnit = body.unit === "COMMON" ? String(body.commonSubUnit ?? "").trim() : null;
    if (body.unit === "COMMON" && !DEFECT_COMMON_SUB_UNITS.includes(commonSubUnit as (typeof DEFECT_COMMON_SUB_UNITS)[number])) {
      return fail("Vui lòng chọn BOP hoặc CHUNG");
    }
    const rawRelatedMappings = Array.isArray(body.relatedDeviceMappings)
      ? body.relatedDeviceMappings as Array<{ deviceSeq?: unknown; mappedUnit?: unknown }>
      : [];
    const relatedDeviceSeqs = normalizeRelatedDeviceSeqs(
      body.relatedDeviceSeqs ?? rawRelatedMappings.map((item) => item.deviceSeq),
      body.device
    );
    if (relatedDeviceSeqs === null) {
      return fail(`Danh sách thiết bị liên quan không hợp lệ hoặc vượt quá ${MAX_DEFECT_RELATED_DEVICES} thiết bị`);
    }
    if (!String(body.shiftLeaderId ?? "").trim()) return fail("Vui lòng chọn Trưởng ca");
    const mappedDeviceUnit = normalizeMappedUnit(body.mappedDeviceUnit, body.unit, body.device);
    const relatedDeviceMappings: DefectDeviceMapping[] = relatedDeviceSeqs.map((deviceSeq) => {
      const raw = rawRelatedMappings.find((item) => String(item?.deviceSeq ?? "").trim() === deviceSeq);
      return { deviceSeq, mappedUnit: normalizeMappedUnit(raw?.mappedUnit, body.unit, deviceSeq) };
    });
    if (body.device) {
      const mappingError = validateMappedDevice(String(body.device), mappedDeviceUnit, body.unit);
      if (mappingError) return fail(mappingError);
    }
    for (const mapping of relatedDeviceMappings) {
      const mappingError = validateMappedDevice(mapping.deviceSeq, mapping.mappedUnit, body.unit);
      if (mappingError) return fail(mappingError);
    }
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

    const detectedAt = body.detectedAt ? parseDateInput(body.detectedAt) : null;
    // Số yêu cầu không nhận từ client — luôn tự cấp số kế tiếp để chuẩn bị cho
    // đồng bộ hai chiều (tránh trùng/gõ sai khi ghi ngược lên Google Sheet).
    const requestYear = (detectedAt ?? new Date()).getUTCFullYear();
    const requestType = String(body.requestType ?? "").trim();
    if (!requestType) return fail("Vui lòng chọn loại phiếu");
    let environmentTarget: ReturnType<typeof resolveDefectEnvironmentSheetTarget> | null = null;
    if (requestType === "Môi Trường") {
      if (!String(body.sourceDeviceRaw ?? "").trim()) {
        return fail("Vui lòng nhập Mã Trạm ghi lên Google Sheet");
      }
      try {
        environmentTarget = resolveDefectEnvironmentSheetTarget(body.environmentSheet);
      } catch (error) {
        return fail(error instanceof Error ? error.message : "Sheet Môi Trường không hợp lệ");
      }
    }
    const content = String(body.content ?? "").trim();
    if (!content) return fail("Vui lòng nhập nội dung khiếm khuyết");
    const severity = String(body.severity ?? "").trim();
    if (!["1", "2", "3", "4"].includes(severity)) return fail("Vui lòng chọn mức độ khiếm khuyết");
    const severityCriteria = normalizeDefectSeverityCriteria(severity, body.severityCriteria);
    if (severityCriteria.length === 0) return fail("Vui lòng chọn ít nhất 1 tiêu chí mức độ");

    const defect = await prisma.$transaction(async (tx) => {
      const requestNumber = await nextDefectRequestNumber(tx, requestYear, requestType);
      const created = await tx.defect.create({
        data: {
          unit: body.unit,
          commonSubUnit,
          device: body.device || null,
          deviceSeq,
          mappedDeviceUnit: deviceSeq ? mappedDeviceUnit : null,
          system: body.system || null,
          positionCode: positionCodeOf(body.system),
          severity,
          severityCriteria,
          condition: body.condition || null,
          requestType,
          requestNumber,
          content,
          repeatedRepairRaw: body.repeatedRepairRaw?.trim() || null,
          websiteCreated: true,
          sourceSpreadsheetId: environmentTarget?.spreadsheetId ?? null,
          sourceSheetName: environmentTarget?.sheetName ?? null,
          sourceDeviceRaw: body.sourceDeviceRaw?.trim() || null,
          status: body.status || "CHUA_XU_LY",
          completedAt: body.status === "DA_XU_LY" ? new Date() : null,
          detectedAt,
          // Bộ đếm nhắc lại chỉ được thay đổi qua API /remind để luôn có đủ
          // lịch sử ngày và Trưởng ca tương ứng.
          reminderCount: 0,
          lastRemindedAt: null,
          shiftLeaderId: shiftLeader?.id ?? null,
          shiftLeaderName: shiftLeader?.name ?? null,
          note: body.note?.trim() || null,
          images,
          fireSafetyImpact: normalizeImpactValue(body.fireSafetyImpact),
          environmentSafetyImpact: normalizeImpactValue(body.environmentSafetyImpact),
          createdById: user.id,
          isMaterialRequest: !!materialRequest,
          relatedDevices: {
            create: relatedDeviceMappings.map(({ deviceSeq, mappedUnit }) => ({ deviceSeq, mappedUnit })),
          },
          materialRequests: materialRequest ? { create: materialRequest.rows } : undefined,
        },
        include: INCLUDE,
      });
      await enqueueDefectSyncEvent(tx, { defect: created, eventType: "CREATE" });
      return created;
    });
    await audit(
      user.id,
      materialRequest ? "CREATE_MATERIAL_DEFECT" : "CREATE_DEFECT",
      "Defect",
      defect.id,
      materialRequest
        ? `${auditDetailWithPosition(user)} · SYC thay thế ${materialRequest.rows.length} điểm`
        : auditDetailWithPosition(user)
    );
    return ok({ ...defect, createdBy: publicUserRef(defect.createdBy) });
  });
}
