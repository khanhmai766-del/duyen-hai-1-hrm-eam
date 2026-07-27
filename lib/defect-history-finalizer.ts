import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteFromS3 } from "@/lib/s3";

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 200;

export interface FinalizePendingDefectHistoryResult {
  dueCount: number;
  finalizedCount: number;
  cancelledCount: number;
  postponedCount: number;
}

function sourceSnapshot(defect: {
  sourceSpreadsheetId: string | null;
  sourceSheetName: string | null;
  sourceRow: number | null;
  sourceDeviceRaw: string | null;
  sourcePositionRaw: string | null;
  sourceStatusRaw: string | null;
  repairResultRaw: string | null;
  sourceStatusMismatch: boolean;
  sourceCompletedAt: Date | null;
  repeatedRepairRaw: string | null;
  fireSafetyImpact: string | null;
  environmentSafetyImpact: string | null;
  severity: string | null;
  condition: string | null;
  note: string | null;
}) {
  return {
    sourceSpreadsheetId: defect.sourceSpreadsheetId,
    sourceSheetName: defect.sourceSheetName,
    sourceRow: defect.sourceRow,
    sourceDeviceRaw: defect.sourceDeviceRaw,
    sourcePositionRaw: defect.sourcePositionRaw,
    sourceStatusRaw: defect.sourceStatusRaw,
    repairResultRaw: defect.repairResultRaw,
    sourceStatusMismatch: defect.sourceStatusMismatch,
    sourceCompletedAt: defect.sourceCompletedAt?.toISOString() ?? null,
    repeatedRepairRaw: defect.repeatedRepairRaw,
    fireSafetyImpact: defect.fireSafetyImpact,
    environmentSafetyImpact: defect.environmentSafetyImpact,
    severity: defect.severity,
    condition: defect.condition,
    note: defect.note,
  } satisfies Prisma.InputJsonObject;
}

export async function finalizePendingDefectHistories(
  requestedBatchSize = DEFAULT_BATCH_SIZE
): Promise<FinalizePendingDefectHistoryResult> {
  const batchSize = Math.min(MAX_BATCH_SIZE, Math.max(1, Math.trunc(requestedBatchSize)));
  const now = new Date();
  const dueRows = await prisma.defectHistoryPending.findMany({
    where: { finalizeAt: { lte: now } },
    select: { id: true },
    orderBy: { finalizeAt: "asc" },
    take: batchSize,
  });

  const result: FinalizePendingDefectHistoryResult = {
    dueCount: dueRows.length,
    finalizedCount: 0,
    cancelledCount: 0,
    postponedCount: 0,
  };

  for (const due of dueRows) {
    const finalized = await prisma.$transaction(async (tx) => {
      // Khóa theo pending ID để hai lượt cron chạy sát nhau không thể tạo trùng lịch sử.
      // Ép kiểu về text để Prisma không phải giải tuần tự kiểu PostgreSQL `void`.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${due.id}))::text AS "lock"`;
      const pending = await tx.defectHistoryPending.findUnique({
        where: { id: due.id },
        include: {
          defect: {
            include: {
              relatedDevices: { select: { deviceSeq: true } },
            },
          },
        },
      });
      if (!pending) return { outcome: "SKIPPED" as const, images: [] as string[] };

      const defect = pending.defect;
      if (defect.status !== "DA_XU_LY") {
        await tx.defectHistoryPending.delete({ where: { id: pending.id } });
        await tx.defect.update({
          where: { id: defect.id },
          data: {
            completedAt: null,
            confirmedAt: null,
            confirmedById: null,
            confirmedByName: null,
            confirmedHistoryId: null,
          },
        });
        return { outcome: "CANCELLED" as const, images: [] as string[] };
      }

      // Phiếu phát sinh chờ vật tư sau khi VHV xác nhận vẫn ở Tồn đọng.
      // Khi bỏ chờ vật tư, lượt cron kế tiếp sẽ chốt lịch sử.
      if (defect.postRepairAwaitingMaterial) {
        return { outcome: "POSTPONED" as const, images: [] as string[] };
      }

      if (defect.confirmedHistoryId) {
        await tx.defectHistoryPending.delete({ where: { id: pending.id } });
        return { outcome: "SKIPPED" as const, images: [] as string[] };
      }

      const history = await tx.defectHistory.create({
        data: {
          defectId: defect.id,
          unit: defect.unit,
          device: defect.device,
          deviceSeq: defect.deviceSeq,
          system: defect.system,
          requestType: pending.requestType || defect.requestType,
          // "Sửa chữa lặp lại" là nội dung sửa chữa mới nhất từ nguồn;
          // nếu nguồn chưa có thì giữ nội dung VHV đã xác nhận.
          content: defect.repeatedRepairRaw?.trim() || pending.content || defect.content,
          requestNumber: defect.requestNumber,
          reminderCount: defect.reminderCount,
          lastRemindedAt: defect.lastRemindedAt,
          reminderRaw: defect.reminderRaw,
          sourceKey: defect.sourceKey,
          sourceSnapshot: sourceSnapshot(defect),
          workOrderNumber: pending.workOrderNumber,
          // Ưu tiên ngày/kết quả mới nhất do bộ phận sửa chữa cập nhật trong 14 ngày.
          performedAt: defect.sourceCompletedAt ?? pending.performedAt,
          result: defect.repairResultRaw?.trim() || pending.result,
          images: [],
          // Người nhập lịch sử là VHV cập nhật phiếu gần nhất.
          createdById: defect.createdById,
          relatedDevices: {
            create: defect.relatedDevices.map(({ deviceSeq }) => ({ deviceSeq })),
          },
        },
        select: { id: true },
      });

      const images = defect.images.length > 0
        ? defect.images
        : defect.imageUrl
          ? [defect.imageUrl]
          : [];
      await tx.defect.update({
        where: { id: defect.id },
        data: {
          images: [],
          imageUrl: null,
          syncState: "CONFIRMED",
          confirmedHistoryId: history.id,
          sourceChangedAfterConfirm: false,
        },
      });
      await tx.defectHistoryPending.delete({ where: { id: pending.id } });
      return { outcome: "FINALIZED" as const, images };
    });

    if (finalized.outcome === "FINALIZED") {
      result.finalizedCount++;
      await Promise.all(finalized.images.map((url) => deleteFromS3(url)));
    } else if (finalized.outcome === "CANCELLED") {
      result.cancelledCount++;
    } else if (finalized.outcome === "POSTPONED") {
      result.postponedCount++;
    }
  }

  return result;
}
