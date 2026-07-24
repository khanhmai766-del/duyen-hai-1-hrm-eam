import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/nav";

type SourceRecord = {
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

type SourceResponse = {
  success: boolean;
  schemaVersion?: number;
  generatedAt?: string;
  source?: string;
  offset?: number;
  nextOffset?: number;
  hasMore?: boolean;
  rawRowCount?: number;
  totalDataRows?: number;
  records?: SourceRecord[];
  errorCode?: string;
  error?: string;
};

export type DefectSyncResult = {
  runId: string;
  readCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  confirmedSkippedCount: number;
  missingCount: number;
  skippedByInterval?: boolean;
};

const CHUNK = 100;
const MIN_INTERVAL_MS = 7 * 60 * 60 * 1000;
const SOURCE_PAGE_SIZE = 750;
const SOURCE_CODES = ["CO", "DIEN"] as const;
const MAX_SOURCE_PAGES = 100;

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

function sourceHash(record: SourceRecord) {
  // Số dòng có thể thay đổi khi người dùng chèn/xóa dòng trên Sheet, không được
  // xem là thay đổi nghiệp vụ.
  const { sourceRow: _sourceRow, ...stableRecord } = record;
  return createHash("sha256").update(JSON.stringify(stableRecord)).digest("hex");
}

function sourceKeyOf(record: SourceRecord, detectedAt: Date | null) {
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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postSourcePage(
  endpoint: string,
  token: string,
  source: (typeof SOURCE_CODES)[number],
  offset: number
): Promise<SourceResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(60_000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          action: "page",
          source,
          offset,
          limit: SOURCE_PAGE_SIZE,
        }),
      });
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Apps Script tạm thời trả HTTP ${response.status}`);
      }
      if (!response.ok) throw new Error(`Apps Script trả HTTP ${response.status}`);
      const payload = await response.json() as SourceResponse;
      if (!payload.success) {
        throw new Error(`${payload.errorCode ? `${payload.errorCode}: ` : ""}${payload.error || "Apps Script trả dữ liệu không thành công"}`);
      }
      if (payload.schemaVersion !== 2) {
        throw new Error(`Phiên bản Apps Script không tương thích: cần V2, nhận V${payload.schemaVersion ?? "không xác định"}`);
      }
      if (payload.source !== source || payload.offset !== offset || !Array.isArray(payload.records)) {
        throw new Error(`Phản hồi phân trang của nguồn ${source} không hợp lệ`);
      }
      return payload;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const permanent = /UNAUTHORIZED|INVALID_|MISSING_COLUMNS|HEADER_NOT_FOUND|SHEET_NOT_FOUND|không tương thích|không hợp lệ/.test(message);
      if (permanent || attempt === 2) throw error;
      await wait(500 * 2 ** attempt);
    }
  }
  throw lastError;
}

async function fetchSource(): Promise<SourceRecord[]> {
  const endpoint = process.env.DEFECT_SYNC_URL?.trim();
  const token = process.env.DEFECT_SYNC_TOKEN?.trim();
  if (!endpoint || !token) throw new Error("Chưa cấu hình DEFECT_SYNC_URL hoặc DEFECT_SYNC_TOKEN");

  const records: SourceRecord[] = [];
  for (const source of SOURCE_CODES) {
    let offset = 0;
    let finished = false;
    for (let page = 0; page < MAX_SOURCE_PAGES; page++) {
      const payload = await postSourcePage(endpoint, token, source, offset);
      records.push(...payload.records!);
      if (!payload.hasMore) {
        finished = true;
        break;
      }
      const nextOffset = Number(payload.nextOffset);
      if (!Number.isInteger(nextOffset) || nextOffset <= offset) {
        throw new Error(`Nguồn ${source} trả nextOffset không hợp lệ`);
      }
      offset = nextOffset;
    }
    if (!finished) {
      throw new Error(`Nguồn ${source} vượt quá ${MAX_SOURCE_PAGES} trang; dừng để tránh vòng lặp`);
    }
  }
  return records;
}

export async function runGoogleDefectSync(params: {
  trigger: "MANUAL" | "CRON";
  user?: { id: string; name?: string | null };
  force?: boolean;
}): Promise<DefectSyncResult> {
  const running = await prisma.defectSyncRun.findFirst({
    where: {
      status: "RUNNING",
      startedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
    },
    orderBy: { startedAt: "desc" },
  });
  if (running) throw new Error("Một lượt đồng bộ khác đang chạy, vui lòng thử lại sau");

  if (!params.force) {
    const latest = await prisma.defectSyncRun.findFirst({
      where: { status: "SUCCESS" },
      orderBy: { startedAt: "desc" },
    });
    if (latest && Date.now() - latest.startedAt.getTime() < MIN_INTERVAL_MS) {
      return {
        runId: latest.id,
        readCount: latest.readCount,
        createdCount: 0,
        updatedCount: 0,
        unchangedCount: latest.unchangedCount,
        confirmedSkippedCount: 0,
        missingCount: 0,
        skippedByInterval: true,
      };
    }
  }

  const creator = params.user ?? await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    select: { id: true, name: true },
  });
  if (!creator) throw new Error("Không tìm thấy tài khoản quản trị để gán người tạo dữ liệu đồng bộ");

  const run = await prisma.defectSyncRun.create({
    data: {
      status: "RUNNING",
      trigger: params.trigger,
      triggeredById: creator.id,
      triggeredByName: creator.name ?? null,
    },
  });

  try {
    const records = await fetchSource();
    const now = new Date();
    const preparedRows = records.flatMap((record) => {
      const detectedAt = parseSourceDate(record.detectedAtRaw);
      const sourceKey = sourceKeyOf(record, detectedAt);
      if (!sourceKey || !text(record.content)) return [];
      const reminder = reminderOf(record.reminderRaw);
      const stt = text(record.stt).replace(/\.0$/, "");
      return [{
        record,
        sourceKey,
        detectedAt,
        reminder,
        hash: sourceHash(record),
        requestNumber: `${stt}/${detectedAt!.getUTCFullYear()}`,
      }];
    });
    const preparedByKey = new Map<string, (typeof preparedRows)[number]>();
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
    // Dòng lặp hoàn toàn giống nhau được gộp thành một bản phản chiếu.
    const prepared = Array.from(preparedByKey.values());

    const existingRows = await prisma.defect.findMany({
      where: { sourceType: "GOOGLE_SHEETS" },
      select: {
        id: true,
        sourceKey: true,
        sourceHash: true,
        syncState: true,
        postRepairAwaitingMaterial: true,
        reminderCount: true,
        lastRemindedAt: true,
      },
    });
    const existingByKey = new Map(existingRows.filter((row) => row.sourceKey).map((row) => [row.sourceKey!, row]));
    const seen = new Set<string>();
    const creates: Prisma.DefectCreateManyInput[] = [];
    const updates: Array<{ id: string; data: Prisma.DefectUpdateInput }> = [];
    const unchangedIds: string[] = [];
    let unchangedCount = 0;
    let confirmedSkippedCount = 0;

    for (const item of prepared) {
      seen.add(item.sourceKey);
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
        continue;
      }

      updates.push({
        id: existing.id,
        data: {
          ...sourceData,
          syncState: "ACTIVE",
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

    const missing = existingRows.filter((row) => row.sourceKey && row.syncState !== "CONFIRMED" && !seen.has(row.sourceKey));
    for (let index = 0; index < missing.length; index += CHUNK) {
      await prisma.defect.updateMany({
        where: { id: { in: missing.slice(index, index + CHUNK).map((row) => row.id) } },
        data: { syncState: "MISSING", sourceSyncedAt: now },
      });
    }

    const updatedCount = updates.length - confirmedSkippedCount;
    const result = {
      runId: run.id,
      readCount: records.length,
      createdCount: creates.length,
      updatedCount,
      unchangedCount,
      confirmedSkippedCount,
      missingCount: missing.length,
    };
    await prisma.defectSyncRun.update({
      where: { id: run.id },
      data: {
        readCount: result.readCount,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        unchangedCount: result.unchangedCount,
        confirmedSkippedCount: result.confirmedSkippedCount,
        missingCount: result.missingCount,
        status: "SUCCESS",
        finishedAt: new Date(),
      },
    });
    return result;
  } catch (error) {
    await prisma.defectSyncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000),
      },
    });
    throw error;
  }
}
