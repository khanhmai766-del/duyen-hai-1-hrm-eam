import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { assertSeqEditable, equipmentSeqWhere, resolveEquipmentAccessForUser } from "@/lib/server-access";
import { publicUserRef } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { dateRange, parseDateInput } from "@/lib/utils";
import { normalizeMappedUnit, validateMappedDevice } from "@/lib/defect-device-mapping";
import { getCachedEquipmentNodeFull } from "@/lib/equipment-node-cache";
import { getEquipmentSeqsWithinDepth } from "@/lib/equipment-tree";

export const dynamic = "force-dynamic";

// Tầng 4: avatar trong list đi qua publicUserRef (proxy theo key) — không chở base64.
const INCLUDE = {
  createdBy: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true } },
  // Tên thiết bị trả kèm từ cây: trước đây giao diện phải tải TOÀN BỘ danh mục thiết bị
  // (~10 MB) chỉ để dựng bảng tra mã → tên cho các dòng đang hiển thị.
  node: { select: { seq: true, name: true } },
  relatedDevices: {
    select: { deviceSeq: true, mappedUnit: true, device: { select: { seq: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};
// Tầng 4: bảng lịch sử phình theo năm tháng — GET luôn có trần, không findMany không giới hạn.
const HISTORY_TAKE = 300;

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const access = await resolveEquipmentAccessForUser(user);
    const { searchParams } = new URL(req.url);
    const system = searchParams.get("system");
    const unit = searchParams.get("unit");
    const mappedUnit = searchParams.get("mappedUnit");
    const workOrderNumber = searchParams.get("workOrderNumber");
    const device = searchParams.get("device");
    const deviceSeq = searchParams.get("deviceSeq")?.trim();
    const descendantDepth = deviceSeq
      ? Math.min(2, Math.max(0, Number.parseInt(searchParams.get("includeDescendants") ?? "0", 10) || 0))
      : 0;
    const deviceSeqs = deviceSeq && descendantDepth > 0
      ? [...getEquipmentSeqsWithinDepth(await getCachedEquipmentNodeFull(), deviceSeq, descendantDepth)]
      : deviceSeq ? [deviceSeq] : [];
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = {};
    const andConditions: Record<string, unknown>[] = [];
    if (system) where.system = system;
    if (unit) where.unit = unit;
    if (!deviceSeq && mappedUnit && ["S1", "S2", "COMMON"].includes(mappedUnit)) {
      andConditions.push({
        OR: [
          { mappedDeviceUnit: mappedUnit },
          { mappedDeviceUnit: null, unit: mappedUnit },
          { relatedDevices: { some: { mappedUnit } } },
        ],
      });
    }
    if (workOrderNumber) where.workOrderNumber = { contains: workOrderNumber, mode: "insensitive" };
    if (device) where.device = { contains: device, mode: "insensitive" };
    if (deviceSeq) {
      andConditions.push({
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
          ...(mappedUnit
            ? [
                { relatedDevices: { some: { deviceSeq: { in: deviceSeqs }, mappedUnit } } },
                { unit: mappedUnit, relatedDevices: { some: { deviceSeq: { in: deviceSeqs }, mappedUnit: null } } },
              ]
            : [{ relatedDevices: { some: { deviceSeq: { in: deviceSeqs } } } }]),
        ],
      });
    }
    if (from || to) {
      where.performedAt = {
        ...(from ? { gte: dateRange(from).start } : {}),
        ...(to ? { lte: dateRange(to).end } : {}),
      };
    }
    // Lọc quyền theo cương vị NGAY TRONG SQL bằng prefix nhánh cây; bản ghi chưa gắn
    // thiết bị (deviceSeq null) vẫn lấy về, xét tiếp bằng rule text bên dưới.
    const scopeWhere = equipmentSeqWhere(access.branchFilter, "deviceSeq");
    if (scopeWhere) andConditions.push({ OR: [scopeWhere, { deviceSeq: null }] });
    if (andConditions.length) where.AND = andConditions;

    const [history, pendingRows] = await Promise.all([
      prisma.defectHistory.findMany({
        where,
        orderBy: { performedAt: "desc" },
        include: INCLUDE,
        take: HISTORY_TAKE,
      }),
      prisma.defectHistoryPending.findMany({
        include: {
          defect: {
            include: {
              createdBy: {
                select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true },
              },
              node: { select: { seq: true, name: true } },
              relatedDevices: {
                select: {
                  deviceSeq: true,
                  mappedUnit: true,
                  device: { select: { seq: true, name: true } },
                },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
        orderBy: { performedAt: "desc" },
        take: HISTORY_TAKE,
      }),
    ]);
    const finalizedData = history
      .filter(
        (item) =>
          !access.hasExplicitScopes ||
          // Có deviceSeq → đã qua lọc SQL; chỉ bản ghi chưa gắn thiết bị mới xét rule text cũ.
          !!item.deviceSeq ||
          access.canViewDeviceLike({ device: item.device, system: item.system })
      )
      .map((item) => ({
        ...item,
        historyStatus: "FINALIZED" as const,
        finalizeAt: null,
        pendingDefectId: null,
        createdBy: publicUserRef(item.createdBy),
      }));

    const fromDate = from ? dateRange(from).start : null;
    const toDate = to ? dateRange(to).end : null;
    const normalizedWorkOrder = workOrderNumber?.toLocaleLowerCase("vi") ?? "";
    const normalizedDevice = device?.toLocaleLowerCase("vi") ?? "";
    const pendingData = pendingRows
      .filter(({ defect, performedAt, workOrderNumber: pendingWorkOrder }) => {
        if (access.hasExplicitScopes) {
          const canView = defect.deviceSeq
            ? access.canViewSeq(defect.deviceSeq)
            : access.canViewDeviceLike({ device: defect.device, system: defect.system });
          if (!canView) return false;
        }
        if (system && defect.system !== system) return false;
        if (unit && defect.unit !== unit) return false;
        if (
          normalizedWorkOrder
          && !(pendingWorkOrder ?? "").toLocaleLowerCase("vi").includes(normalizedWorkOrder)
        ) return false;
        if (
          normalizedDevice
          && !(defect.device ?? "").toLocaleLowerCase("vi").includes(normalizedDevice)
        ) return false;
        if (fromDate && performedAt < fromDate) return false;
        if (toDate && performedAt > toDate) return false;

        const relatedMatches = defect.relatedDevices.some((related) =>
          deviceSeqs.includes(related.deviceSeq)
          && (!mappedUnit || related.mappedUnit === mappedUnit || (!related.mappedUnit && defect.unit === mappedUnit))
        );
        if (deviceSeq) {
          const primaryMatches =
            !!defect.deviceSeq && deviceSeqs.includes(defect.deviceSeq)
            && (!mappedUnit || defect.mappedDeviceUnit === mappedUnit || (!defect.mappedDeviceUnit && defect.unit === mappedUnit));
          if (!primaryMatches && !relatedMatches) return false;
        } else if (mappedUnit && ["S1", "S2", "COMMON"].includes(mappedUnit)) {
          const mappedUnitMatches =
            defect.mappedDeviceUnit === mappedUnit
            || (!defect.mappedDeviceUnit && defect.unit === mappedUnit)
            || defect.relatedDevices.some((related) => related.mappedUnit === mappedUnit);
          if (!mappedUnitMatches) return false;
        }
        return true;
      })
      .map(({ defect, ...pending }) => ({
        id: `pending:${pending.id}`,
        defectId: defect.id,
        unit: defect.unit,
        deviceSeq: defect.deviceSeq,
        mappedDeviceUnit: defect.mappedDeviceUnit,
        device: defect.device,
        system: defect.system,
        requestType: pending.requestType || defect.requestType,
        workOrderNumber: pending.workOrderNumber,
        performedAt: pending.performedAt,
        result: pending.result,
        defectContent: defect.content,
        content: pending.content || defect.repairPerformedContentRaw,
        requestNumber: defect.requestNumber,
        reminderCount: defect.reminderCount,
        lastRemindedAt: defect.lastRemindedAt,
        reminderRaw: defect.reminderRaw,
        sourceKey: defect.sourceKey,
        sourceSnapshot: null,
        images: [] as string[],
        createdById: defect.createdById,
        createdAt: pending.updatedAt,
        createdBy: publicUserRef(defect.createdBy),
        node: defect.node,
        relatedDevices: defect.relatedDevices,
        historyStatus: "PENDING" as const,
        finalizeAt: pending.finalizeAt,
        pendingDefectId: defect.id,
      }));

    const data = [...finalizedData, ...pendingData]
      .sort((a, b) => b.performedAt.getTime() - a.performedAt.getTime())
      .slice(0, HISTORY_TAKE);
    return ok(data, {
      total: data.length,
      finalizedTotal: data.filter((item) => item.historyStatus === "FINALIZED").length,
      pendingTotal: data.filter((item) => item.historyStatus === "PENDING").length,
      capped: history.length === HISTORY_TAKE || pendingRows.length === HISTORY_TAKE,
    });
  });
}

/** Thêm mới một bản ghi lịch sử khiếm khuyết thủ công (không qua phiếu khiếm khuyết). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-manage", ["personal", "manage", "full"], "Không đủ quyền thêm lịch sử khiếm khuyết");
    const body = await req.json();

    if (!body.unit) return fail("Vui lòng chọn tổ máy");
    if (body.device) await assertSeqEditable(user, String(body.device));

    // Khóa liên kết chuẩn với cây: chỉ gán khi "device" là seq có thật.
    const deviceValue = body.device?.trim() || null;
    const deviceSeq = deviceValue
      ? (await prisma.equipmentNode.findUnique({ where: { seq: deviceValue }, select: { seq: true } }))?.seq ?? null
      : null;
    const mappedDeviceUnit = normalizeMappedUnit(body.mappedDeviceUnit, body.unit, deviceSeq);
    if (deviceSeq) {
      const mappingError = validateMappedDevice(deviceSeq, mappedDeviceUnit, body.unit);
      if (mappingError) return fail(mappingError);
    }

    const history = await prisma.defectHistory.create({
      data: {
        unit: body.unit,
        device: deviceValue,
        deviceSeq,
        mappedDeviceUnit: deviceSeq ? mappedDeviceUnit : null,
        system: body.system?.trim() || null,
        requestType: body.requestType?.trim() || null,
        workOrderNumber: body.workOrderNumber?.trim() || null,
        performedAt: body.performedAt ? parseDateInput(body.performedAt) : new Date(),
        result: body.result?.trim() || null,
        defectContent: body.defectContent?.trim() || null,
        content: body.content?.trim() || null,
        requestNumber: body.requestNumber?.trim() || null,
        images: [],
        createdById: user.id,
      },
      include: INCLUDE,
    });
    await audit(user.id, "CREATE_DEFECT_HISTORY", "DefectHistory", history.id, auditDetailWithPosition(user));
    return ok({ ...history, createdBy: publicUserRef(history.createdBy) });
  });
}
