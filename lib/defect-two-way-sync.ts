import { prisma } from "@/lib/prisma";
import { equivalentSourceSheetNames } from "@/lib/defect-request-number";

const SETTING_ID = "singleton";

export const DEFECT_SYNC_FEATURES = {
  UPDATE: "operationUpdateEnabled",
  CREATE: "websiteCreateEnabled",
  REMIND: "websiteRemindEnabled",
} as const;

export type DefectSyncFeature = keyof typeof DEFECT_SYNC_FEATURES;
export type DefectSyncSettingKey =
  | "twoWaySyncEnabled"
  | (typeof DEFECT_SYNC_FEATURES)[DefectSyncFeature];

export async function getDefectTwoWaySyncSetting() {
  return prisma.defectSyncSetting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID },
    update: {},
  });
}

export async function setDefectTwoWaySyncSetting(params: {
  key: DefectSyncSettingKey;
  enabled: boolean;
  updatedBy: { id: string; name: string };
}) {
  return prisma.defectSyncSetting.upsert({
    where: { id: SETTING_ID },
    create: {
      id: SETTING_ID,
      [params.key]: params.enabled,
      updatedById: params.updatedBy.id,
      updatedByName: params.updatedBy.name,
    },
    update: {
      [params.key]: params.enabled,
      updatedById: params.updatedBy.id,
      updatedByName: params.updatedBy.name,
    },
  });
}

export async function isDefectSyncFeatureEnabled(feature: DefectSyncFeature) {
  const setting = await getDefectTwoWaySyncSetting();
  return setting.twoWaySyncEnabled && setting[DEFECT_SYNC_FEATURES[feature]];
}

export async function isDefectSyncEventEnabled(eventType: string) {
  if (!(eventType in DEFECT_SYNC_FEATURES)) return false;
  return isDefectSyncFeatureEnabled(eventType as DefectSyncFeature);
}

export async function getDefectSyncTrafficMetrics() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const [todayRows, waitingRows] = await Promise.all([
    prisma.defectSyncOutbox.findMany({
      where: { createdAt: { gte: startOfToday } },
      select: { eventType: true, status: true, createdAt: true, completedAt: true },
    }),
    prisma.defectSyncOutbox.findMany({
      where: { status: { in: ["PENDING", "PROCESSING", "FAILED"] } },
      orderBy: { createdAt: "asc" },
      select: { eventType: true, status: true, createdAt: true },
    }),
  ]);
  const successfulDurations = todayRows.flatMap((row) =>
    row.status === "SUCCESS" && row.completedAt
      ? [row.completedAt.getTime() - row.createdAt.getTime()]
      : []
  );
  const count = (predicate: (row: (typeof todayRows)[number]) => boolean) =>
    todayRows.filter(predicate).length;

  return {
    todayTotal: todayRows.length,
    todayUpdate: count((row) => row.eventType === "UPDATE"),
    todayCreate: count((row) => row.eventType === "CREATE"),
    todayRemind: count((row) => row.eventType === "REMIND"),
    todaySuccess: count((row) => row.status === "SUCCESS"),
    todayFailed: count((row) => row.status === "FAILED"),
    waiting: waitingRows.length,
    queued: waitingRows.filter((row) => row.status !== "PROCESSING").length,
    processing: waitingRows.filter((row) => row.status === "PROCESSING").length,
    queuedUpdate: waitingRows.filter((row) => row.status !== "PROCESSING" && row.eventType === "UPDATE").length,
    queuedCreate: waitingRows.filter((row) => row.status !== "PROCESSING" && row.eventType === "CREATE").length,
    queuedRemind: waitingRows.filter((row) => row.status !== "PROCESSING" && row.eventType === "REMIND").length,
    processingUpdate: waitingRows.filter((row) => row.status === "PROCESSING" && row.eventType === "UPDATE").length,
    processingCreate: waitingRows.filter((row) => row.status === "PROCESSING" && row.eventType === "CREATE").length,
    processingRemind: waitingRows.filter((row) => row.status === "PROCESSING" && row.eventType === "REMIND").length,
    oldestWaitingAt: waitingRows[0]?.createdAt ?? null,
    averageDurationMs: successfulDurations.length
      ? Math.round(successfulDurations.reduce((sum, value) => sum + value, 0) / successfulDurations.length)
      : null,
  };
}

export async function getReusableCancelledDefectNumbers() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const [cancelledRows, renumberEvents] = await Promise.all([
    prisma.defect.findMany({
      where: {
        requestNumberReuseEligible: true,
        cancelledAt: { not: null },
        syncState: "CONFIRMED",
        requestNumberReleasedAt: { not: null },
        requestNumberReusedAt: null,
        createdAt: { gte: cutoff, lte: now },
      },
      select: {
        id: true,
        requestNumber: true,
        requestType: true,
        sourceSpreadsheetId: true,
        sourceSheetName: true,
        createdAt: true,
        cancelledAt: true,
        requestNumberReleasedAt: true,
      },
    }),
    prisma.defectSyncOutbox.findMany({
      where: { status: "SUCCESS", createdAt: { gte: cutoff, lte: now } },
      select: { id: true, payload: true, createdAt: true, completedAt: true },
    }),
  ]);
  const renumberedRows = renumberEvents.flatMap((event) => {
    if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) return [];
    const requestNumber = String(event.payload.previousRequestNumber ?? "").trim();
    const requestType = String(event.payload.requestType ?? "").trim();
    const sourceSpreadsheetId = String(event.payload.sourceSpreadsheetId ?? "").trim();
    const sourceSheetName = String(event.payload.sourceSheetName ?? "").trim();
    if (!requestNumber || !requestType || !sourceSpreadsheetId || !sourceSheetName) return [];
    return [{
      id: `renumber:${event.id}`,
      requestNumber,
      requestType,
      sourceSpreadsheetId,
      sourceSheetName,
      createdAt: event.createdAt,
      cancelledAt: null,
      requestNumberReleasedAt: event.completedAt ?? event.createdAt,
    }];
  });
  const rows = [...cancelledRows, ...renumberedRows];
  const activeRows = rows.length
    ? await prisma.defect.findMany({
        where: {
          cancelledAt: null,
          requestNumber: { in: rows.flatMap((row) => row.requestNumber ? [row.requestNumber] : []) },
        },
        select: {
          requestNumber: true,
          requestType: true,
          sourceSpreadsheetId: true,
          sourceSheetName: true,
        },
      })
    : [];
  const available = rows.filter((row) => {
    if (row.cancelledAt && row.cancelledAt.getTime() > row.createdAt.getTime() + 6 * 60 * 60 * 1000) return false;
    const equivalentNames = equivalentSourceSheetNames(row.requestType ?? "", row.sourceSheetName ?? "");
    return !activeRows.some(
      (active) => active.requestNumber === row.requestNumber
        && active.requestType === row.requestType
        && active.sourceSpreadsheetId === row.sourceSpreadsheetId
        && equivalentNames.includes(active.sourceSheetName ?? "")
    );
  });
  const unique = new Map<string, (typeof available)[number]>();
  for (const row of available) {
    const key = [row.requestType, row.sourceSpreadsheetId, row.sourceSheetName, row.requestNumber].join("|");
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()].sort((left, right) => {
    const typeOrder = String(left.requestType).localeCompare(String(right.requestType), "vi");
    if (typeOrder) return typeOrder;
    const leftNumber = Number(String(left.requestNumber).split("/")[0].replace(/^QT/i, ""));
    const rightNumber = Number(String(right.requestNumber).split("/")[0].replace(/^QT/i, ""));
    return leftNumber - rightNumber;
  });
}
