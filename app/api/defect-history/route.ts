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
import { positionCatalogItem, positionsMatch } from "@/lib/position-catalog";
import { canViewPosition, positionViewScopeMeta, resolvePositionViewScope } from "@/lib/position-data-scope";

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
// Trần an toàn cho mỗi nhánh. Sau khi tổ máy + cương vị + loại yêu cầu đều được lọc
// trong SQL, tập kết quả thực tế nhỏ hơn nhiều (lớn nhất hiện nay: S1 + Cơ = 532 bản
// đã chốt), nên 1000 vừa đủ dư vừa không thổi phồng payload. `meta.capped` báo lên
// giao diện khi vẫn chạm trần để người dùng biết cần thu hẹp bộ lọc.
const HISTORY_TAKE = 1000;

/**
 * DefectHistory.system là snapshot cương vị từ nhiều nguồn: có thể là nhãn chuẩn,
 * nhãn Sheet có STT hoặc nhãn kèm hậu tố S1/S2. Dựng đủ biến thể để lọc ngay
 * trong SQL trước giới hạn HISTORY_TAKE, sau đó vẫn kiểm tra bằng positionsMatch.
 */
function positionFilterValues(position: string) {
  const catalog = positionCatalogItem(position);
  const sourceValues = [
    position,
    catalog?.label,
    ...(catalog?.aliases ?? []),
    ...Object.values(catalog?.sheetLabels ?? {}),
  ];
  const values = new Set<string>();
  for (const source of sourceValues) {
    const value = source?.trim();
    if (!value) continue;
    const withoutOrder = value.replace(/^\s*\d+\s*[.)-]?\s*/, "").trim();
    const base = withoutOrder.replace(/\s+S[12]$/i, "").trim();
    for (const candidate of [value, withoutOrder, base, `${base} S1`, `${base} S2`]) {
      if (candidate) values.add(candidate);
    }
  }
  return [...values];
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const access = await resolveEquipmentAccessForUser(user);
    // Cùng rào cương vị với trang Khiếm khuyết — lịch sử là bản sao của chính những
    // phiếu đó, vá một bên mà bỏ bên kia thì dữ liệu vẫn xem được qua đường vòng.
    const viewScope = await resolvePositionViewScope(user, "defect");
    const { searchParams } = new URL(req.url);
    // `system` là tên tham số cũ; thực chất cột này lưu snapshot cương vị.
    const position = searchParams.get("position")?.trim() || searchParams.get("system")?.trim();
    const matchingPositionValues = position ? positionFilterValues(position) : [];
    const unit = searchParams.get("unit");
    const mappedUnit = searchParams.get("mappedUnit");
    const workOrderNumber = searchParams.get("workOrderNumber");
    const device = searchParams.get("device");
    const deviceSeq = searchParams.get("deviceSeq")?.trim();
    const descendantDepth = deviceSeq
      ? Math.min(3, Math.max(0, Number.parseInt(searchParams.get("includeDescendants") ?? "0", 10) || 0))
      : 0;
    const deviceSeqs = deviceSeq && descendantDepth > 0
      ? [...getEquipmentSeqsWithinDepth(await getCachedEquipmentNodeFull(), deviceSeq, descendantDepth)]
      : deviceSeq ? [deviceSeq] : [];
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    // Trước đây "Yêu cầu" chỉ lọc ở client, nên trần HISTORY_TAKE cắt mất dữ liệu
    // TRƯỚC khi client kịp lọc: S1 có 818 bản đã chốt, lấy 300 rồi mới lọc Cơ →
    // hiện chưa tới 300/532 dòng thật. Phải lọc ngay trong SQL.
    const requestType = searchParams.get("requestType")?.trim();

    const where: Record<string, unknown> = {};
    const andConditions: Record<string, unknown>[] = [];
    if (matchingPositionValues.length) {
      where.system = { in: matchingPositionValues, mode: "insensitive" };
    }
    if (unit) where.unit = unit;
    if (requestType) where.requestType = requestType;
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

    // SYC thay thế vật tư có màn lịch sử riêng: tab "Lịch sử thay thế" của trang Lịch
    // thay thế vật tư. Không cho nó xuất hiện thêm ở đây, nếu không cùng một công tác
    // bị đếm hai lần ở hai bảng lịch sử.
    //
    // Đọc cờ phẳng chép sẵn trên chính bản ghi lịch sử. DefectHistory.defectId cố ý
    // KHÔNG có quan hệ nên không lọc lồng qua `defect` được; bản đầu phải nạp toàn bộ
    // id SYC rồi NOT IN — tốn một seq scan trên Defect mỗi lần mở trang (9,7 ms với
    // 5.351 phiếu) và danh sách id sẽ phình theo từng chu kỳ thay thế.
    where.isMaterialRequest = false;
    if (andConditions.length) where.AND = andConditions;

    // Điều kiện của nhánh CHỜ CHỐT, dựng riêng cho dễ đọc. Tất cả phải nằm trong SQL
    // và chạy TRƯỚC `take`, nếu không trần sẽ cắt mất dữ liệu trước khi lọc.
    const pendingDefectWhere: Record<string, unknown> = {
      // Cùng lý do như nhánh đã chốt: bản chờ của SYC thay thế vật tư không hiện ở
      // Lịch sử sửa chữa. Ở đây lọc lồng được vì DefectHistoryPending có quan hệ thật.
      isMaterialRequest: false,
    };
    if (matchingPositionValues.length) {
      pendingDefectWhere.system = { in: matchingPositionValues, mode: "insensitive" };
    }
    if (unit) pendingDefectWhere.unit = unit;

    const pendingWhere: Record<string, unknown> = {};
    if (Object.keys(pendingDefectWhere).length) pendingWhere.defect = pendingDefectWhere;
    // requestType hiệu lực = pending.requestType; rỗng thì kế thừa của phiếu gốc.
    if (requestType) {
      pendingWhere.OR = [
        { requestType },
        { requestType: null, defect: { requestType } },
      ];
    }
    if (workOrderNumber) {
      pendingWhere.workOrderNumber = { contains: workOrderNumber, mode: "insensitive" };
    }
    if (from || to) {
      pendingWhere.performedAt = {
        ...(from ? { gte: dateRange(from).start } : {}),
        ...(to ? { lte: dateRange(to).end } : {}),
      };
    }

    const [history, pendingRows] = await Promise.all([
      prisma.defectHistory.findMany({
        where,
        orderBy: { performedAt: "desc" },
        include: INCLUDE,
        take: HISTORY_TAKE,
      }),
      prisma.defectHistoryPending.findMany({
        // Mọi điều kiện thu hẹp được đều phải nằm trong SQL, TRƯỚC `take`. Trước đây
        // chỉ có cương vị ở đây còn tổ máy/ngày/PCT lọc bằng JS sau khi đã cắt 300
        // dòng mới nhất của CẢ BA tổ máy — S1 có 188 phiếu chờ chốt mà chỉ hiện 87.
        where: pendingWhere,
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
      // Rào cương vị áp cho MỌI bản ghi, kể cả bản đã gắn thiết bị (xem
      // lib/position-data-scope.ts). Rào cây thiết bị đã chạy trong SQL ở `scopeWhere`.
      .filter((item) => canViewPosition(item.system, viewScope))
      .filter((item) => !position || positionsMatch(item.system, position))
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
        if (!canViewPosition(defect.system, viewScope)) return false;
        // Nhánh CHỜ CHỐT không đi qua `scopeWhere` của SQL nên rào cây thiết bị phải
        // xét ở đây; bản chưa gắn thiết bị chỉ chịu rào cương vị ở trên.
        if (access.hasExplicitScopes && defect.deviceSeq && !access.canViewSeq(defect.deviceSeq)) {
          return false;
        }
        if (position && !positionsMatch(defect.system, position)) return false;
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

    // KHÔNG cắt lần nữa trên danh sách gộp: hai nhóm được xem ở hai tab riêng, cắt
    // chung theo performedAt khiến nhóm có ngày cũ hơn bị nhóm kia ăn hết chỗ
    // (Chờ chốt S1/Cơ có 9 phiếu nhưng chỉ hiện 8). Mỗi nhánh đã có trần riêng.
    const data = [...finalizedData, ...pendingData]
      .sort((a, b) => b.performedAt.getTime() - a.performedAt.getTime());
    return ok(data, {
      total: data.length,
      finalizedTotal: data.filter((item) => item.historyStatus === "FINALIZED").length,
      pendingTotal: data.filter((item) => item.historyStatus === "PENDING").length,
      capped: history.length === HISTORY_TAKE || pendingRows.length === HISTORY_TAKE,
      positionScope: positionViewScopeMeta(viewScope),
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
