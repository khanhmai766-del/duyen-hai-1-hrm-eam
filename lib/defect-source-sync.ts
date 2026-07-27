import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/nav";

export type DefectSourceRecord = {
  sourceSpreadsheetId: string;
  sourceSheet: string;
  sourceTab?: string;
  sourceRow: number;
  requestType: string;
  stt: string;
  unit: string;
  deviceRaw: string;
  positionRaw: string;
  content: string;
  detectedAtRaw: string;
  shiftLeaderRaw: string;
  reminderRaw: string;
  repeatedRepairRaw: string;
  fireSafetyImpact: string;
  environmentSafetyImpact: string;
  severityRaw: string;
  conditionRaw: string;
  sourceStatusRaw: string;
  repairResultRaw?: string;
  completedAtRaw: string;
  noteRaw: string;
};

export type PreparedDefectSourceRecord = {
  record: DefectSourceRecord;
  sourceKey: string;
  detectedAt: Date;
  reminder: { count: number; lastDate: Date | null };
  hash: string;
  requestNumber: string;
};

export type DefectUpsertStats = {
  readCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  confirmedSkippedCount: number;
};

const CHUNK = 100;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function parseSourceDate(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const match = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!match) return null;
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const date = new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[1])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function unitOf(value: unknown) {
  const unit = text(value).toUpperCase().replace(/\s+/g, " ");
  if (unit === "S1" || unit === "S2") return unit;
  return "COMMON";
}

function statusOf(value: unknown) {
  const normalized = normalizeText(text(value));
  if (normalized.startsWith("da xu ly") || normalized.startsWith("da xong")) return "DA_XU_LY";
  if (normalized.startsWith("dang xu ly") || normalized.startsWith("dang thuc hien")) return "CO_PCT";
  if (normalized.startsWith("cho vat tu")) return "CHO_VAT_TU";
  if (normalized.startsWith("cho ngung may")) return "CHO_NGUNG_MAY";
  return "CHUA_XU_LY";
}

function explicitStatusOf(value: unknown): string | null {
  const normalized = normalizeText(text(value));
  if (!normalized) return null;
  if (normalized.includes("chua xu ly") || normalized.includes("chua thuc hien")) return "CHUA_XU_LY";
  if (normalized.includes("cho vat tu")) return "CHO_VAT_TU";
  if (normalized.includes("cho ngung may")) return "CHO_NGUNG_MAY";
  if (normalized.includes("dang xu ly") || normalized.includes("dang thuc hien")) return "CO_PCT";
  if (normalized.includes("da xu ly") || normalized.includes("da xong") || normalized.includes("hoan thanh")) return "DA_XU_LY";
  return null;
}

function reminderOf(value: unknown) {
  const raw = text(value);
  if (!raw) return { count: 0, lastDate: null as Date | null };

  const explicitCounts = Array.from(raw.matchAll(/l[aầ]n\s*(?:thứ\s*)?(\d+)/gi))
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const dates = Array.from(raw.matchAll(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g))
    .map((match) => parseSourceDate(match[0]))
    .filter((date): date is Date => !!date);
  const distinctDates = new Set(dates.map((date) => date.toISOString().slice(0, 10)));
  const count = explicitCounts.length > 0
    ? Math.max(...explicitCounts)
    : distinctDates.size > 0
      ? distinctDates.size
      : 1;
  const lastDate = dates.length > 0
    ? new Date(Math.max(...dates.map((date) => date.getTime())))
    : null;
  return { count, lastDate };
}

function sourceHash(record: DefectSourceRecord) {
  // Số dòng có thể thay đổi khi người dùng chèn/xóa dòng trên Sheet, không được
  // xem là thay đổi nghiệp vụ.
  const { sourceRow: _sourceRow, ...stableRecord } = record;
  return createHash("sha256").update(JSON.stringify(stableRecord)).digest("hex");
}

function sourceKeyOf(record: DefectSourceRecord, detectedAt: Date | null) {
  const stt = text(record.stt).replace(/\.0$/, "");
  if (!stt || !detectedAt) return null;
  return [
    text(record.sourceSpreadsheetId),
    text(record.sourceSheet),
    text(record.requestType),
    stt,
    detectedAt.toISOString().slice(0, 10),
    unitOf(record.unit),
    normalizeText(record.positionRaw),
    normalizeText(record.deviceRaw),
  ].join("|");
}

export function prepareDefectSourceRecords(records: DefectSourceRecord[]) {
  const preparedRows = records.flatMap((record) => {
    const detectedAt = parseSourceDate(record.detectedAtRaw);
    const sourceKey = sourceKeyOf(record, detectedAt);
    if (!sourceKey || !text(record.content)) return [];
    const reminder = reminderOf(record.reminderRaw);
    const stt = text(record.stt).replace(/\.0$/, "");
    return [{
      record,
      sourceKey,
      detectedAt: detectedAt!,
      reminder,
      hash: sourceHash(record),
      requestNumber: `${stt}/${detectedAt!.getUTCFullYear()}`,
    } satisfies PreparedDefectSourceRecord];
  });

  const preparedByKey = new Map<string, PreparedDefectSourceRecord>();
  const conflictingKeys: string[] = [];
  for (const item of preparedRows) {
    const previous = preparedByKey.get(item.sourceKey);
    if (!previous) {
      preparedByKey.set(item.sourceKey, item);
    } else if (previous.hash !== item.hash) {
      conflictingKeys.push(item.sourceKey);
    }
  }
  if (conflictingKeys.length > 0) {
    throw new Error(`Nguồn có cùng STT/ngày/tổ máy nhưng nội dung khác nhau: ${conflictingKeys.slice(0, 5).join(", ")}`);
  }
  return Array.from(preparedByKey.values());
}

export async function upsertPreparedDefectRecords(params: {
  prepared: PreparedDefectSourceRecord[];
  creator: { id: string };
  syncedAt?: Date;
}): Promise<DefectUpsertStats> {
  const { prepared, creator } = params;
  const now = params.syncedAt ?? new Date();
  const keys = prepared.map((item) => item.sourceKey);
  const existingRows = keys.length > 0
    ? await prisma.defect.findMany({
        where: { sourceKey: { in: keys } },
        select: {
          id: true,
          sourceKey: true,
          sourceHash: true,
          syncState: true,
          status: true,
          completedAt: true,
          postRepairAwaitingMaterial: true,
          reminderCount: true,
          lastRemindedAt: true,
        },
      })
    : [];
  const existingByKey = new Map(existingRows.filter((row) => row.sourceKey).map((row) => [row.sourceKey!, row]));
  const creates: Prisma.DefectCreateManyInput[] = [];
  const updates: Array<{ id: string; data: Prisma.DefectUpdateInput }> = [];
  const unchangedIds: string[] = [];
  const unchangedCompletedIds: string[] = [];
  let unchangedCount = 0;
  let confirmedSkippedCount = 0;

  for (const item of prepared) {
    const existing = existingByKey.get(item.sourceKey);
    const sourceStatus = statusOf(item.record.sourceStatusRaw);
    const repairStatus = explicitStatusOf(item.record.repairResultRaw);
    const sourceData = {
      unit: unitOf(item.record.unit),
      system: text(item.record.positionRaw).replace(/^\d+\.\s*/, "") || null,
      severity: ["1", "2", "3", "4"].includes(text(item.record.severityRaw)) ? text(item.record.severityRaw) : null,
      condition: ["A", "B"].includes(text(item.record.conditionRaw).toUpperCase()) ? text(item.record.conditionRaw).toUpperCase() : null,
      fireSafetyImpact: text(item.record.fireSafetyImpact) || null,
      environmentSafetyImpact: text(item.record.environmentSafetyImpact) || null,
      requestType: text(item.record.requestType) || null,
      requestNumber: item.requestNumber,
      content: text(item.record.content),
      status: sourceStatus,
      detectedAt: item.detectedAt,
      shiftLeaderName: text(item.record.shiftLeaderRaw) || null,
      note: text(item.record.noteRaw) || null,
      reminderRaw: text(item.record.reminderRaw) || null,
      repeatedRepairRaw: text(item.record.repeatedRepairRaw) || null,
      sourceSpreadsheetId: text(item.record.sourceSpreadsheetId),
      sourceSheetName: text(item.record.sourceSheet),
      sourceRow: Number(item.record.sourceRow) || null,
      sourceDeviceRaw: text(item.record.deviceRaw) || null,
      sourcePositionRaw: text(item.record.positionRaw) || null,
      sourceStatusRaw: text(item.record.sourceStatusRaw) || null,
      repairResultRaw: text(item.record.repairResultRaw) || null,
      sourceStatusMismatch: repairStatus !== null && repairStatus !== sourceStatus,
      sourceCompletedAt: parseSourceDate(item.record.completedAtRaw),
      sourceHash: item.hash,
      sourceSyncedAt: now,
      sourceLastSeenAt: now,
    };

    if (!existing) {
      creates.push({
        ...sourceData,
        sourceType: "GOOGLE_SHEETS",
        sourceKey: item.sourceKey,
        completedAt: sourceStatus === "DA_XU_LY" ? now : null,
        reminderCount: item.reminder.count,
        lastRemindedAt: item.reminder.lastDate,
        createdById: creator.id,
      });
      continue;
    }

    if (existing.syncState === "CONFIRMED") {
      confirmedSkippedCount++;
      updates.push({
        id: existing.id,
        data: {
          sourceLastSeenAt: now,
          sourceSyncedAt: now,
          sourceChangedAfterConfirm: existing.sourceHash !== item.hash,
        },
      });
      continue;
    }

    if (existing.sourceHash === item.hash && existing.syncState === "ACTIVE") {
      unchangedCount++;
      unchangedIds.push(existing.id);
      if (sourceStatus === "DA_XU_LY" && !existing.completedAt) {
        unchangedCompletedIds.push(existing.id);
      }
      continue;
    }

    updates.push({
      id: existing.id,
      data: {
        ...sourceData,
        syncState: "ACTIVE",
        completedAt:
          sourceStatus === "DA_XU_LY"
            ? existing.completedAt ?? now
            : null,
        postRepairAwaitingMaterial:
          sourceData.status === "DA_XU_LY" ? existing.postRepairAwaitingMaterial : false,
        reminderCount: Math.max(existing.reminderCount, item.reminder.count),
        lastRemindedAt:
          !existing.lastRemindedAt || (item.reminder.lastDate && item.reminder.lastDate > existing.lastRemindedAt)
            ? item.reminder.lastDate
            : existing.lastRemindedAt,
      },
    });
  }

  for (let index = 0; index < creates.length; index += CHUNK) {
    await prisma.defect.createMany({ data: creates.slice(index, index + CHUNK) });
  }
  for (let index = 0; index < updates.length; index += CHUNK) {
    await prisma.$transaction(
      updates.slice(index, index + CHUNK).map((item) =>
        prisma.defect.update({ where: { id: item.id }, data: item.data })
      )
    );
  }
  for (let index = 0; index < unchangedIds.length; index += 1000) {
    await prisma.defect.updateMany({
      where: { id: { in: unchangedIds.slice(index, index + 1000) } },
      data: { sourceLastSeenAt: now, sourceSyncedAt: now },
    });
  }
  for (let index = 0; index < unchangedCompletedIds.length; index += 1000) {
    await prisma.defect.updateMany({
      where: { id: { in: unchangedCompletedIds.slice(index, index + 1000) } },
      data: { completedAt: now },
    });
  }

  return {
    readCount: prepared.length,
    createdCount: creates.length,
    updatedCount: updates.length - confirmedSkippedCount,
    unchangedCount,
    confirmedSkippedCount,
  };
}
