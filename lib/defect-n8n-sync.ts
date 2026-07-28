import { createHash, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteFromS3 } from "@/lib/s3";
import {
  prepareDefectSourceRecords,
  upsertPreparedDefectRecords,
  type DefectSourceRecord,
} from "@/lib/defect-source-sync";

export const N8N_DEFECT_SOURCES = ["CO", "DIEN"] as const;
export type N8nDefectSource = (typeof N8N_DEFECT_SOURCES)[number];

export const N8N_DEFECT_SOURCE_SPREADSHEET_IDS: Record<N8nDefectSource, string> = {
  CO: "1zKRH9zhEAkCwGRl4KiaNwUlkLg9_l4WXNSBeg3FK_MA",
  DIEN: "1nPKFBr3wXfOFE4y_WACDs7cvb1ZZA-mg0mZbsIuB_lQ",
};

const MAX_BATCH_SIZE = 500;
const MAX_TEXT_LENGTH = 20_000;
const RUN_TIMEOUT_MS = 30 * 60 * 1000;
const RUN_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const PROCESSING_BATCH_TIMEOUT_MS = 15 * 60 * 1000;

function text(value: unknown, field: string, maxLength = MAX_TEXT_LENGTH) {
  const result = String(value ?? "").trim();
  if (result.length > maxLength) throw new Error(`${field} vượt quá ${maxLength} ký tự`);
  return result;
}

function optionalInteger(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return 0;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0) throw new Error(`${field} phải là số nguyên không âm`);
  return result;
}

function isSource(value: unknown): value is N8nDefectSource {
  return N8N_DEFECT_SOURCES.includes(value as N8nDefectSource);
}

export function verifyN8nDefectToken(authorization: string | null) {
  const expected = process.env.N8N_DEFECT_SYNC_TOKEN?.trim() ?? "";
  const received = authorization?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!expected || !received) return false;
  const expectedHash = createHash("sha256").update(expected).digest();
  const receivedHash = createHash("sha256").update(received).digest();
  return timingSafeEqual(expectedHash, receivedHash);
}

export function parseN8nSources(value: unknown) {
  if (!Array.isArray(value)) throw new Error("expectedSources phải là một mảng");
  const sources = Array.from(new Set(value.map((item) => text(item, "source", 20).toUpperCase())));
  if (sources.length === 0 || sources.some((source) => !isSource(source))) {
    throw new Error("Nguồn đồng bộ phải gồm CO, DIEN hoặc cả hai");
  }
  return sources as N8nDefectSource[];
}

export function parseN8nDefectRecords(value: unknown, source: N8nDefectSource) {
  if (!Array.isArray(value) || value.length === 0) throw new Error("records phải là mảng không rỗng");
  if (value.length > MAX_BATCH_SIZE) throw new Error(`Mỗi batch chỉ được tối đa ${MAX_BATCH_SIZE} dòng`);

  return value.map((input, index): DefectSourceRecord => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error(`Dòng ${index + 1} không phải object hợp lệ`);
    }
    const row = input as Record<string, unknown>;
    const sourceSpreadsheetId = text(
      row.sourceSpreadsheetId,
      `records[${index}].sourceSpreadsheetId`,
      300
    );
    if (sourceSpreadsheetId !== N8N_DEFECT_SOURCE_SPREADSHEET_IDS[source]) {
      throw new Error(`Dòng ${index + 1} không thuộc đúng Sheet nguồn ${source}`);
    }
    const stt = text(row.stt, `records[${index}].stt`, 200);
    const content = text(row.content, `records[${index}].content`);
    const detectedAtRaw = text(row.detectedAtRaw, `records[${index}].detectedAtRaw`, 100);
    if (!stt || !content || !detectedAtRaw) {
      throw new Error(`Dòng ${index + 1} thiếu STT, nội dung hoặc ngày phát hiện`);
    }

    const requestType = text(row.requestType, `records[${index}].requestType`, 100)
      || (source === "CO" ? "Cơ" : "Điện");
    return {
      sourceSpreadsheetId,
      sourceSheet: text(row.sourceSheet, `records[${index}].sourceSheet`, 300),
      sourceTab: text(row.sourceTab, `records[${index}].sourceTab`, 300),
      sourceRow: optionalInteger(row.sourceRow, `records[${index}].sourceRow`),
      requestType,
      stt,
      unit: text(row.unit, `records[${index}].unit`, 100),
      deviceRaw: text(row.deviceRaw, `records[${index}].deviceRaw`, 2_000),
      positionRaw: text(row.positionRaw, `records[${index}].positionRaw`, 2_000),
      content,
      detectedAtRaw,
      shiftLeaderRaw: text(row.shiftLeaderRaw, `records[${index}].shiftLeaderRaw`, 2_000),
      reminderRaw: text(row.reminderRaw, `records[${index}].reminderRaw`),
      repeatedRepairRaw: text(row.repeatedRepairRaw, `records[${index}].repeatedRepairRaw`),
      fireSafetyImpact: text(row.fireSafetyImpact, `records[${index}].fireSafetyImpact`, 500),
      environmentSafetyImpact: text(row.environmentSafetyImpact, `records[${index}].environmentSafetyImpact`, 500),
      severityRaw: text(row.severityRaw, `records[${index}].severityRaw`, 100),
      conditionRaw: text(row.conditionRaw, `records[${index}].conditionRaw`, 100),
      sourceStatusRaw: text(row.sourceStatusRaw, `records[${index}].sourceStatusRaw`, 2_000),
      repairResultRaw: text(row.repairResultRaw, `records[${index}].repairResultRaw`),
      completedAtRaw: text(row.completedAtRaw, `records[${index}].completedAtRaw`, 100),
      noteRaw: text(row.noteRaw, `records[${index}].noteRaw`),
    };
  });
}

export async function startN8nDefectRun(params: {
  externalRunId: string;
  expectedSources: N8nDefectSource[];
}) {
  const externalRunId = text(params.externalRunId, "externalRunId", 200);
  if (!externalRunId) throw new Error("Thiếu externalRunId");

  const now = new Date();
  const staleBefore = new Date(now.getTime() - RUN_TIMEOUT_MS);
  const staleRuns = await prisma.defectSyncRun.findMany({
    where: { trigger: "N8N", status: "RUNNING", startedAt: { lt: staleBefore } },
    select: { id: true },
  });
  const staleRunIds = staleRuns.map((run) => run.id);
  if (staleRunIds.length > 0) {
    await prisma.$transaction([
      prisma.defectSyncRun.updateMany({
        where: { id: { in: staleRunIds }, status: "RUNNING" },
        data: {
          status: "FAILED",
          finishedAt: now,
          error: "Lượt đồng bộ n8n quá thời gian và được hệ thống tự đóng",
        },
      }),
      prisma.defectSyncSeen.deleteMany({
        where: { runId: { in: staleRunIds } },
      }),
    ]);
  }

  await prisma.defectSyncRun.deleteMany({
    where: {
      status: { not: "RUNNING" },
      finishedAt: { lt: new Date(now.getTime() - RUN_RETENTION_MS) },
    },
  });

  const existing = await prisma.defectSyncRun.findUnique({ where: { externalRunId } });
  if (existing) return existing;

  const running = await prisma.defectSyncRun.findFirst({
    where: { status: "RUNNING", startedAt: { gte: staleBefore } },
    select: { id: true },
  });
  if (running) throw new Error("Một lượt đồng bộ khác đang chạy");

  const creator = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    select: { id: true, name: true },
  });
  if (!creator) throw new Error("Không tìm thấy tài khoản quản trị để gán người tạo dữ liệu đồng bộ");

  return prisma.defectSyncRun.create({
    data: {
      status: "RUNNING",
      trigger: "N8N",
      externalRunId,
      expectedSources: params.expectedSources,
      triggeredById: creator.id,
      triggeredByName: creator.name,
    },
  });
}

export async function ingestN8nDefectBatch(params: {
  runId: string;
  source: N8nDefectSource;
  batchNumber: number;
  records: DefectSourceRecord[];
}) {
  const run = await prisma.defectSyncRun.findUnique({ where: { id: params.runId } });
  if (!run || run.trigger !== "N8N") throw new Error("Không tìm thấy lượt đồng bộ n8n");
  if (run.status !== "RUNNING") {
    if (run.status === "SUCCESS") throw new Error("Lượt đồng bộ đã hoàn tất");
    throw new Error("Lượt đồng bộ không còn hoạt động");
  }
  if (!run.expectedSources.includes(params.source)) throw new Error("Nguồn không thuộc lượt đồng bộ này");
  if (!Number.isInteger(params.batchNumber) || params.batchNumber < 1) {
    throw new Error("batchNumber phải là số nguyên từ 1");
  }

  const batchKey = {
    runId_source_batchNumber: {
      runId: run.id,
      source: params.source,
      batchNumber: params.batchNumber,
    },
  };
  const previousBatch = await prisma.defectSyncBatch.findUnique({ where: batchKey });
  if (previousBatch?.status === "SUCCESS") return previousBatch;
  if (
    previousBatch?.status === "PROCESSING"
    && previousBatch.updatedAt.getTime() > Date.now() - PROCESSING_BATCH_TIMEOUT_MS
  ) {
    throw new Error("Batch này đang được xử lý");
  }

  const prepared = prepareDefectSourceRecords(params.records);
  if (prepared.length !== params.records.length) {
    throw new Error("Batch có dòng thiếu khóa hoặc có khóa trùng; từ chối ghi một phần");
  }

  const seen = await prisma.defectSyncSeen.findMany({
    where: { runId: run.id, sourceKey: { in: prepared.map((item) => item.sourceKey) } },
    select: { sourceKey: true, sourceHash: true },
  });
  const seenByKey = new Map(seen.map((item) => [item.sourceKey, item.sourceHash]));
  const conflict = prepared.find((item) => {
    const priorHash = seenByKey.get(item.sourceKey);
    return priorHash && priorHash !== item.hash;
  });
  if (conflict) throw new Error(`Khóa ${conflict.sourceKey} xuất hiện nhiều lần nhưng nội dung khác nhau`);

  const batch = previousBatch
    ? await prisma.defectSyncBatch.update({
        where: { id: previousBatch.id },
        data: { status: "PROCESSING", error: null, recordCount: params.records.length },
      })
    : await prisma.defectSyncBatch.create({
        data: {
          runId: run.id,
          source: params.source,
          batchNumber: params.batchNumber,
          status: "PROCESSING",
          recordCount: params.records.length,
        },
      });

  try {
    const stats = await upsertPreparedDefectRecords({
      prepared,
      creator: { id: run.triggeredById! },
    });

    await prisma.$transaction(async (tx) => {
      await tx.defectSyncSeen.createMany({
        data: prepared.map((item) => ({
          runId: run.id,
          sourceKey: item.sourceKey,
          source: params.source,
          sourceHash: item.hash,
        })),
        skipDuplicates: true,
      });
      await tx.defectSyncBatch.update({
        where: { id: batch.id },
        data: {
          status: "SUCCESS",
          recordCount: stats.readCount,
          createdCount: stats.createdCount,
          updatedCount: stats.updatedCount,
          unchangedCount: stats.unchangedCount,
          confirmedSkippedCount: stats.confirmedSkippedCount,
          error: null,
        },
      });
      await tx.defectSyncRun.update({
        where: { id: run.id },
        data: {
          readCount: { increment: stats.readCount },
          createdCount: { increment: stats.createdCount },
          updatedCount: { increment: stats.updatedCount },
          unchangedCount: { increment: stats.unchangedCount },
          confirmedSkippedCount: { increment: stats.confirmedSkippedCount },
        },
      });
    });

    return { ...batch, status: "SUCCESS", ...stats };
  } catch (error) {
    await prisma.defectSyncBatch.update({
      where: { id: batch.id },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000),
      },
    });
    throw error;
  }
}

export async function finishN8nDefectRun(params: {
  runId: string;
  completedSources: N8nDefectSource[];
}) {
  const run = await prisma.defectSyncRun.findUnique({ where: { id: params.runId } });
  if (!run || run.trigger !== "N8N") throw new Error("Không tìm thấy lượt đồng bộ n8n");
  if (run.status === "SUCCESS") return run;
  if (run.status !== "RUNNING") throw new Error("Lượt đồng bộ không còn hoạt động");
  if (
    run.expectedSources.length !== params.completedSources.length
    || !run.expectedSources.every((source) => params.completedSources.includes(source as N8nDefectSource))
  ) {
    throw new Error("Chỉ được finish khi hoàn tất đúng các nguồn của lượt đồng bộ");
  }

  const batchCounts = await prisma.defectSyncBatch.groupBy({
    by: ["source"],
    where: { runId: run.id, status: "SUCCESS" },
    _count: { _all: true },
  });
  if (!params.completedSources.every((source) => batchCounts.some((item) => item.source === source && item._count._all > 0))) {
    throw new Error("Mỗi nguồn phải có ít nhất một batch thành công");
  }

  const completedSpreadsheetIds = params.completedSources.map(
    (source) => N8N_DEFECT_SOURCE_SPREADSHEET_IDS[source]
  );

  const result = await prisma.$transaction(async (tx) => {
    const missingCount = await tx.$executeRaw(Prisma.sql`
      UPDATE "Defect" AS defect
      SET
        "syncState" = 'MISSING',
        "sourceSyncedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE defect."sourceType" = 'GOOGLE_SHEETS'
        AND defect."sourceKey" IS NOT NULL
        AND defect."sourceSpreadsheetId" IN (${Prisma.join(completedSpreadsheetIds)})
        AND defect."syncState" <> 'CONFIRMED'
        AND NOT EXISTS (
          SELECT 1
          FROM "DefectSyncSeen" AS seen
          WHERE seen."runId" = ${run.id}
            AND seen."sourceKey" = defect."sourceKey"
        )
    `);

    // STT là số phiếu yêu cầu duy nhất trong từng Sheet nguồn. Nếu một STT đã
    // xuất hiện lại dưới dạng phiếu ACTIVE thì bản MISSING cùng STT là phiếu cũ
    // đã bị thay thế, không còn giá trị nghiệp vụ. Phiếu MISSING có STT duy nhất
    // (ví dụ nguồn bị thiếu ngày phát hiện) vẫn được giữ để VHV kiểm tra.
    const duplicateMissing = await tx.$queryRaw<Array<{
      id: string;
      images: string[];
      imageUrl: string | null;
    }>>(Prisma.sql`
      SELECT
        missing."id",
        missing."images",
        missing."imageUrl"
      FROM "Defect" AS missing
      WHERE missing."sourceType" = 'GOOGLE_SHEETS'
        AND missing."syncState" = 'MISSING'
        AND missing."sourceSpreadsheetId" IN (${Prisma.join(completedSpreadsheetIds)})
        AND NULLIF(BTRIM(split_part(COALESCE(missing."requestNumber", ''), '/', 1)), '') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM "Defect" AS active
          WHERE active."sourceType" = 'GOOGLE_SHEETS'
            AND active."syncState" = 'ACTIVE'
            AND active."sourceSpreadsheetId" = missing."sourceSpreadsheetId"
            AND BTRIM(split_part(COALESCE(active."requestNumber", ''), '/', 1))
              = BTRIM(split_part(COALESCE(missing."requestNumber", ''), '/', 1))
            AND active."id" <> missing."id"
        )
    `);
    if (duplicateMissing.length > 0) {
      await tx.defect.deleteMany({
        where: { id: { in: duplicateMissing.map((item) => item.id) } },
      });
    }

    const remainingMissingCount = Math.max(0, missingCount - duplicateMissing.length);
    const finished = await tx.defectSyncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        completedSources: params.completedSources,
        missingCount: remainingMissingCount,
        error: null,
      },
    });
    await tx.defectSyncSeen.deleteMany({ where: { runId: run.id } });
    return {
      finished,
      deletedImageUrls: duplicateMissing.flatMap((item) => [
        ...item.images,
        ...(item.imageUrl ? [item.imageUrl] : []),
      ]),
    };
  });

  const imageCleanupResults = await Promise.allSettled(
    result.deletedImageUrls.map((url) => deleteFromS3(url))
  );
  for (const cleanupResult of imageCleanupResults) {
    if (cleanupResult.status === "rejected") {
      console.error("[n8n defect sync] Không thể xóa ảnh của phiếu MISSING trùng STT", cleanupResult.reason);
    }
  }
  return result.finished;
}

export async function failN8nDefectRun(params: { runId: string; message?: string }) {
  const run = await prisma.defectSyncRun.findUnique({ where: { id: params.runId } });
  if (!run || run.trigger !== "N8N") throw new Error("Không tìm thấy lượt đồng bộ n8n");
  if (run.status !== "RUNNING") return run;

  return prisma.$transaction(async (tx) => {
    const failed = await tx.defectSyncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: text(params.message, "message", 2_000) || "Workflow n8n báo lượt đồng bộ thất bại",
      },
    });
    await tx.defectSyncSeen.deleteMany({ where: { runId: run.id } });
    return failed;
  });
}

export async function failN8nDefectRunByExternalId(params: {
  externalRunId: string;
  message?: string;
}) {
  const externalRunId = text(params.externalRunId, "externalRunId", 200);
  if (!externalRunId) throw new Error("Thiếu externalRunId");

  const run = await prisma.defectSyncRun.findUnique({
    where: { externalRunId },
    select: { id: true },
  });
  if (!run) return null;

  return failN8nDefectRun({
    runId: run.id,
    message: params.message,
  });
}

export function parseN8nSource(value: unknown) {
  const source = text(value, "source", 20).toUpperCase();
  if (!isSource(source)) throw new Error("source chỉ nhận CO hoặc DIEN");
  return source;
}

export function n8nDefectSyncErrorMessage(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError
    || error instanceof Prisma.PrismaClientInitializationError
    || error instanceof Prisma.PrismaClientValidationError
  ) {
    console.error("[n8n defect sync]", error);
    return "Không thể ghi dữ liệu đồng bộ vào database";
  }
  return error instanceof Error ? error.message : "Dữ liệu đồng bộ không hợp lệ";
}
