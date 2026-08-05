import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/nav";
import { defectResultStatusOf } from "@/lib/defect-result-status";
import { positionCodeOf } from "@/lib/position-catalog";

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
  ktatReviewRaw?: string;
  boardDirectionRaw?: string;
  repairOrderNumberRaw?: string;
  repairSolutionRaw?: string;
  repairPlanRaw?: string;
  repairUnitRaw?: string;
  repairResultRaw?: string;
  repairPerformedByRaw?: string;
  repairStartedAtRaw?: string;
  completedAtRaw: string;
  repairPerformedContentRaw?: string;
  repairNoteRaw?: string;
  noteRaw: string;
};

export type PreparedDefectSourceRecord = {
  record: DefectSourceRecord;
  sourceKey: string;
  legacySourceKey: string;
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
const COMPLETED_HISTORY_PENDING_DAYS = 4;

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

// Sheet có 4 giá trị Tổ máy: S1 | S2 | BOP | CHUNG. BOP và CHUNG đều gộp về
// "COMMON" ở trên (dùng cho lọc/phân quyền hiện có), nhưng là 2 khái niệm khác
// nhau nên lưu thêm ở đây để không mất thông tin khi đọc từ Sheet.
function commonSubUnitOf(value: unknown): "BOP" | "CHUNG" | null {
  const unit = text(value).toUpperCase().replace(/\s+/g, " ");
  if (unit === "BOP") return "BOP";
  if (unit === "CHUNG") return "CHUNG";
  return null;
}

function statusOf(value: unknown) {
  const normalized = normalizeText(text(value));
  if (normalized.startsWith("da xu ly") || normalized.startsWith("da xong")) return "DA_XU_LY";
  if (normalized.startsWith("dang xu ly") || normalized.startsWith("dang thuc hien")) return "CO_PCT";
  if (normalized.startsWith("cho vat tu")) return "CHO_VAT_TU";
  if (normalized.startsWith("cho ngung may")) return "CHO_NGUNG_MAY";
  return "CHUA_XU_LY";
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

function sourceKeyOf(
  record: DefectSourceRecord,
  detectedAt: Date | null,
  canonicalPosition = true
) {
  const stt = text(record.stt).replace(/\.0$/, "");
  if (!stt || !detectedAt) return null;
  return [
    text(record.sourceSpreadsheetId),
    text(record.sourceSheet),
    text(record.requestType),
    stt,
    detectedAt.toISOString().slice(0, 10),
    unitOf(record.unit),
    canonicalPosition
      ? positionCodeOf(record.positionRaw) ?? normalizeText(record.positionRaw)
      : normalizeText(record.positionRaw),
    normalizeText(record.deviceRaw),
  ].join("|");
}

export function prepareDefectSourceRecords(records: DefectSourceRecord[]) {
  const preparedRows = records.flatMap((record) => {
    const detectedAt = parseSourceDate(record.detectedAtRaw);
    const sourceKey = sourceKeyOf(record, detectedAt);
    const legacySourceKey = sourceKeyOf(record, detectedAt, false);
    if (!sourceKey || !text(record.content)) return [];
    const reminder = reminderOf(record.reminderRaw);
    const stt = text(record.stt).replace(/\.0$/, "");
    return [{
      record,
      sourceKey,
      legacySourceKey: legacySourceKey!,
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
  const syncSetting = await prisma.defectSyncSetting.findUnique({ where: { id: "singleton" } });
  const twoWaySyncEnabled = syncSetting?.twoWaySyncEnabled === true;
  const operationWriteEnabled =
    twoWaySyncEnabled && syncSetting?.operationUpdateEnabled === true;
  const keys = Array.from(new Set(
    prepared.flatMap((item) => [item.sourceKey, item.legacySourceKey])
  ));
  const existingRows = keys.length > 0
    ? await prisma.defect.findMany({
        where: { sourceKey: { in: keys } },
        select: {
          id: true,
          sourceKey: true,
          positionCode: true,
          sourceHash: true,
          cancelledAt: true,
          sourceStatusMismatch: true,
          syncState: true,
          websiteCreated: true,
          status: true,
          severity: true,
          condition: true,
          fireSafetyImpact: true,
          environmentSafetyImpact: true,
          note: true,
          completedAt: true,
          postRepairAwaitingMaterial: true,
          reminderCount: true,
          lastRemindedAt: true,
          pendingHistory: { select: { id: true } },
        },
      })
    : [];
  const existingByKey = new Map(existingRows.filter((row) => row.sourceKey).map((row) => [row.sourceKey!, row]));
  const existingFor = (item: PreparedDefectSourceRecord) =>
    existingByKey.get(item.sourceKey) ?? existingByKey.get(item.legacySourceKey);

  // Phiếu MANUAL tạo qua website (chưa từng qua Sheet nên sourceKey = null) có thể
  // đã được đẩy ra Sheet ở chiều ghi và giờ đọc lại đúng dòng đó. STT/năm là khóa
  // duy nhất theo nghiệp vụ nên dùng nó để nhận diện, gắn sourceKey vào thay vì
  // tạo một bản ghi Defect trùng.
  const unmatchedRequestNumbers = prepared
    .filter((item) => !existingFor(item))
    .map((item) => item.requestNumber);
  const manualCandidateRows = unmatchedRequestNumbers.length > 0
    ? await prisma.defect.findMany({
        where: {
          sourceKey: null,
          cancelledAt: null,
          requestNumber: { in: unmatchedRequestNumbers },
        },
        select: {
          id: true,
          requestNumber: true,
          sourceKey: true,
          positionCode: true,
          sourceHash: true,
          cancelledAt: true,
          sourceStatusMismatch: true,
          syncState: true,
          websiteCreated: true,
          status: true,
          severity: true,
          condition: true,
          fireSafetyImpact: true,
          environmentSafetyImpact: true,
          note: true,
          completedAt: true,
          postRepairAwaitingMaterial: true,
          reminderCount: true,
          lastRemindedAt: true,
          pendingHistory: { select: { id: true } },
        },
      })
    : [];
  const existingByRequestNumber = new Map(
    manualCandidateRows
      .filter((row) => row.requestNumber)
      .map((row) => [row.requestNumber!, row])
  );
  if (existingByRequestNumber.size !== manualCandidateRows.filter((row) => row.requestNumber).length) {
    const counts = new Map<string, number>();
    for (const row of manualCandidateRows) {
      if (row.requestNumber) counts.set(row.requestNumber, (counts.get(row.requestNumber) ?? 0) + 1);
    }
    const duplicated = [...counts.entries()].filter(([, count]) => count > 1).map(([number]) => number);
    throw new Error(`Không thể tự ghép phiếu do trùng số yêu cầu: ${duplicated.join(", ")}`);
  }

  // Chỉ giữ các trường Vận hành trên website khi thay đổi UPDATE
  // thực sự còn trong hàng đợi. Khi đã ACK thành công, Sheet lại được
  // phép cập nhật vòng về website ở lần pull tiếp theo.
  const existingDefectIds = Array.from(new Set(
    [...existingRows, ...manualCandidateRows].map((row) => row.id)
  ));
  const pendingWebsiteUpdateRows = operationWriteEnabled && existingDefectIds.length > 0
    ? await prisma.defectSyncOutbox.findMany({
        where: {
          defectId: { in: existingDefectIds },
          eventType: "UPDATE",
          status: { in: ["PENDING", "PROCESSING", "FAILED"] },
        },
        select: { defectId: true },
        distinct: ["defectId"],
      })
    : [];
  const pendingWebsiteUpdateDefectIds = new Set(
    pendingWebsiteUpdateRows.map((row) => row.defectId)
  );

  const creates: Prisma.DefectCreateManyInput[] = [];
  const updates: Array<{ id: string; data: Prisma.DefectUpdateInput }> = [];
  const unchangedIds: string[] = [];
  const cancelledPendingIds: string[] = [];
  const detachedCancelledIds: string[] = [];
  const expeditedPendingIds: string[] = [];
  let unchangedCount = 0;
  let confirmedSkippedCount = 0;

  for (const item of prepared) {
    const matchedByKeyCandidate = existingFor(item);
    const sourceStatus = statusOf(item.record.sourceStatusRaw);
    const sourceNote = text(item.record.noteRaw) || null;
    // Dòng của phiếu đã hủy vẫn còn nguyên trên Sheet thì chỉ ghi nhận đã thấy,
    // không tạo lại. Nếu cùng khóa nguồn nhưng nội dung/trạng thái đã trở thành
    // một phiếu khác, tháo khóa khỏi vòng đời đã hủy để dòng mới được nhập như
    // một Defect ACTIVE độc lập.
    const cancelledRowStillSame = Boolean(
      matchedByKeyCandidate?.cancelledAt
      && (
        // Chiều ghi chưa ACK: Sheet có thể vẫn đang giữ trạng thái trước khi
        // hủy; website phải thắng và tuyệt đối không được hiểu nhầm thành phiếu mới.
        pendingWebsiteUpdateDefectIds.has(matchedByKeyCandidate.id)
        || (
          matchedByKeyCandidate.status === sourceStatus
          && matchedByKeyCandidate.note === sourceNote
        )
      )
    );
    const reusedCancelledSource = Boolean(
      matchedByKeyCandidate?.cancelledAt
      && matchedByKeyCandidate.sourceHash !== item.hash
      && !cancelledRowStillSame
    );
    if (reusedCancelledSource && matchedByKeyCandidate) {
      detachedCancelledIds.push(matchedByKeyCandidate.id);
    }
    const matchedByKey = reusedCancelledSource ? undefined : matchedByKeyCandidate;
    const matchedByRequestNumber = matchedByKey ? undefined : existingByRequestNumber.get(item.requestNumber);
    const existing = matchedByKey ?? matchedByRequestNumber;
    const repairStatus = defectResultStatusOf(item.record.repairResultRaw);
    const sourceData = {
      unit: unitOf(item.record.unit),
      commonSubUnit: commonSubUnitOf(item.record.unit),
      system: text(item.record.positionRaw).replace(/^\d+\.\s*/, "") || null,
      positionCode: positionCodeOf(item.record.positionRaw),
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
      note: sourceNote,
      reminderRaw: text(item.record.reminderRaw) || null,
      repeatedRepairRaw: text(item.record.repeatedRepairRaw) || null,
      sourceSpreadsheetId: text(item.record.sourceSpreadsheetId),
      sourceSheetName: text(item.record.sourceSheet),
      sourceRow: Number(item.record.sourceRow) || null,
      sourceDeviceRaw: text(item.record.deviceRaw) || null,
      sourcePositionRaw: text(item.record.positionRaw) || null,
      sourceStatusRaw: text(item.record.sourceStatusRaw) || null,
      ktatReviewRaw: text(item.record.ktatReviewRaw) || null,
      boardDirectionRaw: text(item.record.boardDirectionRaw) || null,
      repairOrderNumberRaw: text(item.record.repairOrderNumberRaw) || null,
      repairSolutionRaw: text(item.record.repairSolutionRaw) || null,
      repairPlanRaw: text(item.record.repairPlanRaw) || null,
      repairUnitRaw: text(item.record.repairUnitRaw) || null,
      repairResultRaw: text(item.record.repairResultRaw) || null,
      repairPerformedByRaw: text(item.record.repairPerformedByRaw) || null,
      repairStartedAt: parseSourceDate(item.record.repairStartedAtRaw),
      sourceStatusMismatch: repairStatus !== null && repairStatus !== sourceStatus,
      sourceCompletedAt: parseSourceDate(item.record.completedAtRaw),
      repairPerformedContentRaw: text(item.record.repairPerformedContentRaw) || null,
      repairNoteRaw: text(item.record.repairNoteRaw) || null,
      sourceHash: item.hash,
      sourceSyncedAt: now,
      sourceLastSeenAt: now,
    };
    const keepWebsiteOperationData = Boolean(
      existing && operationWriteEnabled && pendingWebsiteUpdateDefectIds.has(existing.id)
    );
    const effectiveStatus = keepWebsiteOperationData && existing
      ? existing.status
      : sourceData.status;
    // Dữ liệu quan sát/kết quả sửa chữa luôn nhận từ Sheet. Riêng các
    // trường Vận hành chỉ giữ bản website trong lúc UPDATE còn chờ ghi.
    const sourceObservationData = {
      sourceSpreadsheetId: sourceData.sourceSpreadsheetId,
      sourceSheetName: sourceData.sourceSheetName,
      sourceRow: sourceData.sourceRow,
      sourceDeviceRaw: sourceData.sourceDeviceRaw,
      sourcePositionRaw: sourceData.sourcePositionRaw,
      sourceStatusRaw: sourceData.sourceStatusRaw,
      ktatReviewRaw: sourceData.ktatReviewRaw,
      boardDirectionRaw: sourceData.boardDirectionRaw,
      repairOrderNumberRaw: sourceData.repairOrderNumberRaw,
      repairSolutionRaw: sourceData.repairSolutionRaw,
      repairPlanRaw: sourceData.repairPlanRaw,
      repairUnitRaw: sourceData.repairUnitRaw,
      repairResultRaw: sourceData.repairResultRaw,
      repairPerformedByRaw: sourceData.repairPerformedByRaw,
      repairStartedAt: sourceData.repairStartedAt,
      sourceStatusMismatch: repairStatus !== null && repairStatus !== effectiveStatus,
      sourceCompletedAt: sourceData.sourceCompletedAt,
      repairPerformedContentRaw: sourceData.repairPerformedContentRaw,
      repairNoteRaw: sourceData.repairNoteRaw,
      sourceHash: sourceData.sourceHash,
      sourceSyncedAt: sourceData.sourceSyncedAt,
      sourceLastSeenAt: sourceData.sourceLastSeenAt,
    };
    const sourceOperationData = {
      fireSafetyImpact: sourceData.fireSafetyImpact,
      environmentSafetyImpact: sourceData.environmentSafetyImpact,
      severity: sourceData.severity,
      condition: sourceData.condition,
      status: sourceData.status,
      note: sourceData.note,
    };

    if (!existing) {
      creates.push({
        ...sourceData,
        sourceType: "GOOGLE_SHEETS",
        sourceKey: item.sourceKey,
        // Mốc 14 ngày chỉ bắt đầu khi VHV bấm xác nhận đưa vào lịch sử.
        completedAt: null,
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
          sourceChangedAfterConfirm: existing.cancelledAt ? false : existing.sourceHash !== item.hash,
          sourceHash: existing.cancelledAt ? item.hash : undefined,
        },
      });
      continue;
    }

    if (
      existing.sourceHash === item.hash
      && existing.syncState === "ACTIVE"
      && existing.sourceKey === item.sourceKey
      && existing.positionCode === sourceData.positionCode
      && existing.sourceStatusMismatch === (
        repairStatus !== null
        && repairStatus !== effectiveStatus
      )
      && (
        keepWebsiteOperationData
        || (
          existing.fireSafetyImpact === sourceData.fireSafetyImpact
          && existing.environmentSafetyImpact === sourceData.environmentSafetyImpact
          && existing.severity === sourceData.severity
          && existing.condition === sourceData.condition
          && existing.status === sourceData.status
          && existing.note === sourceData.note
        )
      )
    ) {
      unchangedCount++;
      unchangedIds.push(existing.id);
      continue;
    }

    const cancelPending = !twoWaySyncEnabled && sourceStatus !== "DA_XU_LY" && Boolean(existing.pendingHistory);
    if (cancelPending) cancelledPendingIds.push(existing.id);
    if (
      existing.pendingHistory
      && existing.status === "DA_XU_LY"
      && repairStatus === "DA_XU_LY"
    ) {
      expeditedPendingIds.push(existing.id);
    }
    updates.push({
      id: existing.id,
      data: {
        ...(twoWaySyncEnabled
          ? existing.websiteCreated
            ? {
                ...sourceObservationData,
                ...(!keepWebsiteOperationData ? sourceOperationData : {}),
              }
            : {
                ...sourceData,
                // UPDATE đang chờ thì website thắng; hết hàng đợi thì J:O
                // được phép đồng bộ ngược từ Sheet về website.
                ...(keepWebsiteOperationData
                  ? {
                      fireSafetyImpact: existing.fireSafetyImpact,
                      environmentSafetyImpact: existing.environmentSafetyImpact,
                      severity: existing.severity,
                      condition: existing.condition,
                      status: existing.status,
                      note: existing.note,
                    }
                  : sourceOperationData),
              }
          : sourceData),
        sourceStatusMismatch: repairStatus !== null && repairStatus !== effectiveStatus,
        // Khi ghép phiếu website với dòng vừa ghi lên Sheet, chuyển sang chế độ
        // theo dõi Google Sheet nhưng giữ websiteCreated để không mất các thao
        // tác Nhắc lại/Hoàn thành.
        ...(matchedByRequestNumber || existing.sourceKey !== item.sourceKey
          ? { sourceType: "GOOGLE_SHEETS" as const, sourceKey: item.sourceKey }
          : {}),
        syncState: "ACTIVE",
        completedAt: twoWaySyncEnabled
          ? existing.completedAt
          : sourceStatus === "DA_XU_LY"
            ? existing.completedAt
            : null,
        confirmedAt: cancelPending ? null : undefined,
        confirmedById: cancelPending ? null : undefined,
        confirmedByName: cancelPending ? null : undefined,
        confirmedHistoryId: cancelPending ? null : undefined,
        postRepairAwaitingMaterial: twoWaySyncEnabled
          ? existing.postRepairAwaitingMaterial
          : sourceData.status === "DA_XU_LY"
            ? existing.postRepairAwaitingMaterial
            : false,
        reminderCount: twoWaySyncEnabled
          ? existing.reminderCount
          : Math.max(existing.reminderCount, item.reminder.count),
        lastRemindedAt: twoWaySyncEnabled
          ? existing.lastRemindedAt
          : !existing.lastRemindedAt || (item.reminder.lastDate && item.reminder.lastDate > existing.lastRemindedAt)
            ? item.reminder.lastDate
            : existing.lastRemindedAt,
      },
    });
  }

  for (let index = 0; index < detachedCancelledIds.length; index += 1000) {
    await prisma.defect.updateMany({
      where: { id: { in: detachedCancelledIds.slice(index, index + 1000) } },
      data: { sourceKey: null },
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
  for (let index = 0; index < cancelledPendingIds.length; index += 1000) {
    await prisma.defectHistoryPending.deleteMany({
      where: { defectId: { in: cancelledPendingIds.slice(index, index + 1000) } },
    });
  }
  const expeditedFinalizeAt = new Date(
    now.getTime() + COMPLETED_HISTORY_PENDING_DAYS * 24 * 60 * 60 * 1000
  );
  for (let index = 0; index < expeditedPendingIds.length; index += 1000) {
    await prisma.defectHistoryPending.updateMany({
      where: {
        defectId: { in: expeditedPendingIds.slice(index, index + 1000) },
        // Không kéo dài một hạn đã gần hơn; chỉ được phép rút ngắn.
        finalizeAt: { gt: expeditedFinalizeAt },
      },
      data: { finalizeAt: expeditedFinalizeAt },
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
