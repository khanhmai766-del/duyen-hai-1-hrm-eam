import type { Prisma } from "@prisma/client";
import { DEFECT_REQUEST_TYPES, daysUntilDue, replacementDueStatus } from "@/lib/constants";
import { getCachedEquipmentNodeList, getEquipmentTreeIndexFor } from "@/lib/equipment-node-cache";
import { normalizeText } from "@/lib/nav";
import { positionsMatch } from "@/lib/position-catalog";
import { GROUPABLE_CATEGORIES } from "@/lib/oil-grouping-sync";
import {
  announcementPositionsMatch,
  selectableManagingPositionOptions,
} from "@/lib/positions";
import {
  normalizePositionScopeKey,
  normalizeScopeAccess,
  positionScopeOptions,
  scopesForPosition,
} from "@/lib/position-system-scopes";
import { prisma } from "@/lib/prisma";
import { hasAssignedManagePermission } from "@/lib/rbac-permissions";
import {
  equipmentSeqWhere,
  loadPositionSystemScopeRows,
  resolveEquipmentAccessForUser,
} from "@/lib/server-access";
import { dateRange } from "@/lib/utils";
import type {
  EquipmentDashboardData,
  EquipmentDashboardMonthlyRow,
  EquipmentDashboardSignalRow,
  EquipmentDashboardSystemRow,
} from "@/types/equipment-dashboard";

type DashboardUser = {
  id?: string;
  role?: string;
  position?: string | null;
  currentPosition?: string | null;
};

type DashboardFilters = {
  from?: string;
  to?: string;
};

type CacheEntry = {
  value: EquipmentDashboardData;
  expiresAt: number;
  generatedAt: string;
};

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 32;
const dashboardCache = new Map<string, CacheEntry>();
const dashboardInFlight = new Map<string, Promise<EquipmentDashboardData>>();

function activeDefectWhere(now: Date): Prisma.DefectWhereInput {
  const completedCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  return {
    OR: [
      { sourceType: "GOOGLE_SHEETS", syncState: { not: "CONFIRMED" } },
      { sourceType: { not: "GOOGLE_SHEETS" }, status: { not: "DA_XU_LY" } },
      { status: "DA_XU_LY", postRepairAwaitingMaterial: true },
      {
        sourceType: { not: "GOOGLE_SHEETS" },
        status: "DA_XU_LY",
        postRepairAwaitingMaterial: false,
        completedAt: { gte: completedCutoff },
      },
    ],
  };
}

function validDateFilter(value?: string) {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : value;
}

function cacheKey(user: DashboardUser, filters: DashboardFilters, now: Date) {
  return JSON.stringify({
    userId: user.id ?? "",
    role: user.role ?? "",
    position: normalizePositionScopeKey(user.currentPosition ?? user.position),
    from: validDateFilter(filters.from) ?? "",
    to: validDateFilter(filters.to) ?? "",
    day: now.toISOString().slice(0, 10),
  });
}

function trimCache(now: number) {
  for (const [key, entry] of dashboardCache) {
    if (entry.expiresAt <= now) dashboardCache.delete(key);
  }
  while (dashboardCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = dashboardCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    dashboardCache.delete(oldestKey);
  }
}

export async function getEquipmentDashboard(
  user: DashboardUser,
  filters: DashboardFilters
): Promise<{
  data: EquipmentDashboardData;
  cache: "HIT" | "MISS";
  generatedAt: string;
}> {
  const now = new Date();
  const key = cacheKey(user, filters, now);
  const cached = dashboardCache.get(key);
  if (cached && cached.expiresAt > now.getTime()) {
    dashboardCache.delete(key);
    dashboardCache.set(key, cached);
    return { data: cached.value, cache: "HIT", generatedAt: cached.generatedAt };
  }

  const existing = dashboardInFlight.get(key);
  if (existing) {
    return {
      data: await existing,
      cache: "HIT",
      generatedAt: new Date().toISOString(),
    };
  }

  const generatedAt = new Date().toISOString();
  const promise = buildEquipmentDashboard(user, filters, now);
  dashboardInFlight.set(key, promise);
  try {
    const data = await promise;
    trimCache(Date.now());
    dashboardCache.set(key, {
      value: data,
      expiresAt: Date.now() + CACHE_TTL_MS,
      generatedAt,
    });
    return { data, cache: "MISS", generatedAt };
  } finally {
    dashboardInFlight.delete(key);
  }
}

export function invalidateEquipmentDashboardCache() {
  dashboardCache.clear();
  dashboardInFlight.clear();
}

async function buildEquipmentDashboard(
  user: DashboardUser,
  filters: DashboardFilters,
  now: Date
): Promise<EquipmentDashboardData> {
  const [nodes, scopes, users] = await Promise.all([
    getCachedEquipmentNodeList(),
    loadPositionSystemScopeRows(),
    prisma.user.findMany({
      where: { isActive: true },
      select: {
        position: true,
        secondaryPosition: true,
        secondaryPosition2: true,
      },
    }),
  ]);
  const access = await resolveEquipmentAccessForUser(user, nodes);
  const index = getEquipmentTreeIndexFor(nodes);
  const leafNodes = nodes.filter((node) => (index.childrenOf.get(node.seq) ?? []).length === 0);
  const visibleLeafNodes = leafNodes.filter((node) => access.visibleSeqs.has(node.seq));
  const visibleLeafSeqs = new Set(visibleLeafNodes.map((node) => node.seq));

  const userPositions = users.flatMap((item) => [
    item.position,
    item.secondaryPosition,
    item.secondaryPosition2,
  ]);
  const positions = positionScopeOptions(selectableManagingPositionOptions(userPositions));

  const devices = visibleLeafNodes.map((node) => {
    const parentSeq = index.parentOf.get(node.seq) ?? node.parentSeq ?? null;
    const parent = parentSeq ? index.bySeq.get(parentSeq) ?? null : null;
    return {
      code: node.seq,
      name: node.name,
      system: parent?.name ?? null,
      systemSeq: parent?.seq ?? null,
      managingPosition: null as string | null,
    };
  });
  const deviceByCode = new Map(devices.map((device) => [device.code, device]));

  const allowedDeviceCodesByPosition = new Map<string, Set<string>>();
  const assignedPositionByDevice = new Map<string, { position: string; depth: number }>();
  const positionsWithoutScopes: string[] = [];

  for (const position of positions) {
    const explicitScopes = scopesForPosition(scopes, position);
    if (!explicitScopes.length) {
      positionsWithoutScopes.push(position);
      continue;
    }
    const accessBySeq = new Map(
      explicitScopes.map((scope) => [scope.systemSeq, normalizeScopeAccess(scope.access)] as const)
    );
    const allowed = new Set<string>();
    for (const device of devices) {
      let current: string | null = device.code;
      while (current) {
        const scopeAccess = accessBySeq.get(current);
        if (scopeAccess) {
          if (scopeAccess !== "none") allowed.add(device.code);
          if (scopeAccess === "edit") {
            const depth = current.split(".").length;
            const assigned = assignedPositionByDevice.get(device.code);
            if (
              !assigned ||
              depth > assigned.depth ||
              (depth === assigned.depth && position.localeCompare(assigned.position, "vi") < 0)
            ) {
              assignedPositionByDevice.set(device.code, { position, depth });
            }
          }
          break;
        }
        const dot = current.lastIndexOf(".");
        current = dot > 0 ? current.slice(0, dot) : null;
      }
    }
    allowedDeviceCodesByPosition.set(position, allowed);
  }

  for (const device of devices) {
    device.managingPosition = assignedPositionByDevice.get(device.code)?.position ?? null;
  }
  for (const position of positionsWithoutScopes) {
    allowedDeviceCodesByPosition.set(
      position,
      new Set(
        devices
          .filter(
            (device) =>
              !device.managingPosition ||
              positionsMatch(device.managingPosition, position)
          )
          .map((device) => device.code)
      )
    );
  }

  const scopeWhere = equipmentSeqWhere(access.branchFilter, "deviceSeq");
  const from = validDateFilter(filters.from);
  const to = validDateFilter(filters.to);
  const historyDateWhere =
    from || to
      ? {
          performedAt: {
            ...(from ? { gte: dateRange(from).start } : {}),
            ...(to ? { lte: dateRange(to).end } : {}),
          },
        }
      : {};
  const canAccessAllReplacements = await hasAssignedManagePermission(user, "replacement-manage");

  const [defectCandidates, historyCandidates, replacements, repairStats, oilRows] =
    await Promise.all([
      prisma.defect.findMany({
        where: {
          AND: [
            activeDefectWhere(now),
            ...(scopeWhere
              ? [{ OR: [scopeWhere, { deviceSeq: null }] } as Prisma.DefectWhereInput]
              : []),
          ],
        },
        select: {
          deviceSeq: true,
          device: true,
          system: true,
          status: true,
          severity: true,
          requestType: true,
          detectedAt: true,
          createdAt: true,
          sourceType: true,
        },
      }),
      prisma.defectHistory.findMany({
        where: {
          AND: [
            historyDateWhere,
            ...(scopeWhere
              ? [{ OR: [scopeWhere, { deviceSeq: null }] } as Prisma.DefectHistoryWhereInput]
              : []),
          ],
        },
        select: {
          deviceSeq: true,
          device: true,
          system: true,
          requestType: true,
          performedAt: true,
        },
      }),
      prisma.materialReplacement.findMany({
        where: { isActive: true, intervalMonths: { gt: 0 } },
        orderBy: { nextDueAt: "asc" },
        select: {
          id: true,
          deviceSeq: true,
          system: true,
          nextDueAt: true,
          samplingOnly: true,
          material: { select: { name: true, system: true } },
          device: { select: { seq: true, name: true } },
        },
      }),
      prisma.repairLog.groupBy({
        by: ["deviceSeq"],
        _count: { _all: true },
      }),
      prisma.oilType.groupBy({
        by: ["category"],
        where: { category: { in: [...GROUPABLE_CATEGORIES] } },
        _count: { _all: true },
      }),
    ]);

  const activePosition = user.currentPosition ?? user.position;
  const defects = defectCandidates.filter((defect) => {
    if (!access.hasExplicitScopes) return true;
    if (defect.deviceSeq) return access.canViewSeq(defect.deviceSeq);
    if (defect.sourceType === "GOOGLE_SHEETS") {
      return announcementPositionsMatch(defect.system, activePosition);
    }
    return access.canViewDeviceLike({ device: defect.device, system: defect.system });
  });
  const history = historyCandidates.filter(
    (item) =>
      !access.hasExplicitScopes ||
      (item.deviceSeq
        ? access.canViewSeq(item.deviceSeq)
        : access.canViewDeviceLike({ device: item.device, system: item.system }))
  );
  const visibleReplacements = canAccessAllReplacements
    ? replacements
    : replacements.filter((item) => {
        if (!access.hasExplicitScopes) return true;
        if (item.deviceSeq) return access.canViewSeq(item.deviceSeq);
        if (item.system) return access.visibleSystemNames.has(normalizeText(item.system));
        return false;
      });

  const openDefects = defects.filter((defect) => defect.status !== "DA_XU_LY");
  const urgentDefects = openDefects.filter(
    (defect) => defect.severity === "1" || defect.severity === "2"
  );
  // Điểm chỉ lấy mẫu định kỳ không vào các nhóm cảnh báo thay thế của dashboard.
  const trackedReplacements = visibleReplacements.filter((item) => !item.samplingOnly);
  const dueGroups = { OVERDUE: 0, DUE_SOON: 0, OK: 0 };
  for (const item of trackedReplacements) {
    dueGroups[replacementDueStatus(item.nextDueAt)] += 1;
  }

  const systems = Array.from(
    new Set(devices.map((device) => device.system).filter((value): value is string => !!value))
  );

  const openDefectsByDevice = new Map<string, number>();
  for (const defect of openDefects) {
    const seq = defect.deviceSeq ?? defect.device;
    if (!seq || !visibleLeafSeqs.has(seq)) continue;
    openDefectsByDevice.set(seq, (openDefectsByDevice.get(seq) ?? 0) + 1);
  }
  const replacementWarningsByDevice = new Map<string, number>();
  for (const item of trackedReplacements) {
    if (!item.deviceSeq || replacementDueStatus(item.nextDueAt) === "OK") continue;
    replacementWarningsByDevice.set(
      item.deviceSeq,
      (replacementWarningsByDevice.get(item.deviceSeq) ?? 0) + 1
    );
  }
  const historyCountByDevice = new Map<string, number>();
  for (const item of history) {
    const seq = item.deviceSeq ?? item.device;
    if (!seq || !visibleLeafSeqs.has(seq)) continue;
    historyCountByDevice.set(seq, (historyCountByDevice.get(seq) ?? 0) + 1);
  }
  const repairLogCountByDevice = new Map(
    repairStats
      .filter((item) => visibleLeafSeqs.has(item.deviceSeq))
      .map((item) => [item.deviceSeq, item._count._all] as const)
  );

  const signalRows: EquipmentDashboardSignalRow[] = [];
  for (const device of devices) {
    const repairCount =
      historyCountByDevice.get(device.code) ?? repairLogCountByDevice.get(device.code) ?? 0;
    const openDefectCount = openDefectsByDevice.get(device.code) ?? 0;
    const replacementWarn = replacementWarningsByDevice.get(device.code) ?? 0;
    const signalTotal = repairCount + openDefectCount + replacementWarn;
    if (signalTotal === 0) continue;
    const riskScore = repairCount + openDefectCount * 3 + replacementWarn * 2;
    signalRows.push({
      code: device.code,
      name: device.name,
      system: device.system ?? "Chưa phân hệ",
      managingPosition: device.managingPosition ?? "Chưa gán",
      repairCount,
      openDefectCount,
      replacementWarn,
      signalTotal,
      riskScore,
      recommendation:
        openDefectCount > 0
          ? "Ưu tiên xử lý khiếm khuyết"
          : replacementWarn > 0
            ? "Theo dõi vật tư đến hạn"
            : repairCount > 1
              ? "Rà soát lặp lại sửa chữa"
              : "Theo dõi sau sửa chữa",
    });
  }
  signalRows.sort((a, b) => b.riskScore - a.riskScore || b.signalTotal - a.signalTotal);
  const topSignalRows = signalRows.slice(0, 8);

  const systemRowsByPosition: Record<string, EquipmentDashboardSystemRow[]> = {};
  const buildSystemRows = (allowed?: Set<string>) => {
    const rows = new Map<string, EquipmentDashboardSystemRow>();
    for (const device of devices) {
      if (allowed && !allowed.has(device.code)) continue;
      const system = device.system;
      if (!system) continue;
      const row = rows.get(system) ?? { name: system, devices: 0, defects: 0, warning: 0 };
      row.devices += 1;
      rows.set(system, row);
    }
    for (const [seq, count] of openDefectsByDevice) {
      if (allowed && !allowed.has(seq)) continue;
      const system = deviceByCode.get(seq)?.system;
      if (!system) continue;
      const row = rows.get(system);
      if (row) row.defects += count;
    }
    for (const item of trackedReplacements) {
      if (replacementDueStatus(item.nextDueAt) === "OK") continue;
      if (allowed && (!item.deviceSeq || !allowed.has(item.deviceSeq))) continue;
      const system =
        (item.deviceSeq ? deviceByCode.get(item.deviceSeq)?.system : null) ??
        item.system ??
        item.material.system;
      if (!system) continue;
      const row = rows.get(system);
      if (row) row.warning += 1;
    }
    return Array.from(rows.values())
      .sort((a, b) => b.devices - a.devices)
      .slice(0, 8);
  };
  systemRowsByPosition.ALL = buildSystemRows();
  for (const position of positions) {
    systemRowsByPosition[position] = buildSystemRows(
      allowedDeviceCodesByPosition.get(position) ?? new Set()
    );
  }

  const positionRows = positions
    .map((position) => ({
      name: position,
      value: allowedDeviceCodesByPosition.get(position)?.size ?? 0,
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const filterStart = from ? dateRange(from).start : null;
  const filterEnd = to ? dateRange(to).end : null;
  const withinDefectDateFilter = (value: Date) =>
    (!filterStart || value >= filterStart) && (!filterEnd || value <= filterEnd);
  const visibleDefects = defects.filter((defect) =>
    withinDefectDateFilter(defect.detectedAt ?? defect.createdAt)
  );
  const statusRows = [
    {
      name: "Chưa xử lý",
      value: visibleDefects.filter((defect) => defect.status === "CHUA_XU_LY").length,
    },
    {
      name: "Có PCT",
      value: visibleDefects.filter((defect) => defect.status === "CO_PCT").length,
    },
    {
      name: "Chờ vật tư",
      value: visibleDefects.filter((defect) => defect.status === "CHO_VAT_TU").length,
    },
    {
      name: "Đã xử lý",
      value: visibleDefects.filter((defect) => defect.status === "DA_XU_LY").length,
    },
  ].filter((row) => row.value > 0);

  const currentYear = now.getFullYear();
  const trendKeys = ["ALL", ...DEFECT_REQUEST_TYPES];
  const monthlyTrendByRequestType: Record<string, EquipmentDashboardMonthlyRow[]> =
    Object.fromEntries(
      trendKeys.map((key) => [
        key,
        Array.from({ length: 12 }, (_, index) => ({
          month: `Th${index + 1}`,
          detected: 0,
          handled: 0,
        })),
      ])
    );
  for (const defect of defects) {
    const occurredAt = defect.detectedAt ?? defect.createdAt;
    if (occurredAt.getFullYear() !== currentYear) continue;
    monthlyTrendByRequestType.ALL[occurredAt.getMonth()].detected += 1;
    if (defect.requestType && monthlyTrendByRequestType[defect.requestType]) {
      monthlyTrendByRequestType[defect.requestType][occurredAt.getMonth()].detected += 1;
    }
  }
  const repairYearMap = new Map<number, number>();
  for (const item of history) {
    const year = item.performedAt.getFullYear();
    repairYearMap.set(year, (repairYearMap.get(year) ?? 0) + 1);
    if (year !== currentYear) continue;
    monthlyTrendByRequestType.ALL[item.performedAt.getMonth()].handled += 1;
    if (item.requestType && monthlyTrendByRequestType[item.requestType]) {
      monthlyTrendByRequestType[item.requestType][item.performedAt.getMonth()].handled += 1;
    }
  }
  const repairYearCounts = Array.from(repairYearMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, repairs]) => ({ year: String(year), repairs }));
  if (!repairYearMap.has(currentYear)) {
    repairYearCounts.unshift({ year: String(currentYear), repairs: 0 });
  }

  const upcomingReplacements = trackedReplacements
    .map((item) => {
      const linkedDevice = item.deviceSeq ? deviceByCode.get(item.deviceSeq) : null;
      return {
        id: item.id,
        material: item.material.name,
        device: item.device
          ? `${item.device.seq} - ${item.device.name}`
          : "Chưa gắn thiết bị",
        system:
          linkedDevice?.system ?? item.system ?? item.material.system ?? "Chưa phân hệ",
        nextDueAt: item.nextDueAt.toISOString(),
        daysLeft: daysUntilDue(item.nextDueAt, now),
        status: replacementDueStatus(item.nextDueAt, now),
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 6);

  const totalGroups = oilRows.reduce((total, row) => total + row._count._all, 0);

  return {
    totalSystemDevices: nodes.length,
    systems,
    positions,
    openDefectCount: openDefects.length,
    urgentDefectCount: urgentDefects.length,
    dueGroups,
    materialSummary: {
      totalGroups,
      categoryCount: GROUPABLE_CATEGORIES.length,
    },
    systemRowsByPosition,
    positionRows,
    statusRows,
    defectChartRows: topSignalRows
      .filter((device) => device.openDefectCount > 0)
      .sort((a, b) => b.openDefectCount - a.openDefectCount),
    replacementChartRows: topSignalRows
      .filter((device) => device.replacementWarn > 0)
      .sort((a, b) => b.replacementWarn - a.replacementWarn),
    upcomingReplacements,
    currentYear,
    monthlyTrendByRequestType,
    repairYearCounts,
  };
}
