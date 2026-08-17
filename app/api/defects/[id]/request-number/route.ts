import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { enqueueDefectSyncEvent } from "@/lib/defect-sync-outbox";
import { isDefectSyncFeatureEnabled } from "@/lib/defect-two-way-sync";
import { consumeReusableCancelledRequestNumber } from "@/lib/defect-request-number";

export const dynamic = "force-dynamic";

function payloadRequestNumber(payload: Prisma.JsonValue) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  return String(payload.requestNumber ?? "").trim();
}

function sameSheetIdentity(
  left: {
    sourceSpreadsheetId: string | null;
    sourceSheetName: string | null;
    sourceRow: number | null;
    detectedAt: Date | null;
    unit: string;
    content: string | null;
    sourceDeviceRaw: string | null;
    sourcePositionRaw: string | null;
  },
  right: typeof left
) {
  if (
    !left.sourceSpreadsheetId
    || left.sourceSpreadsheetId !== right.sourceSpreadsheetId
    || !left.sourceSheetName
    || left.sourceSheetName !== right.sourceSheetName
  ) return false;
  if (left.sourceRow && right.sourceRow && left.sourceRow === right.sourceRow) return true;
  return Boolean(
    left.detectedAt
    && right.detectedAt
    && left.detectedAt.getTime() === right.detectedAt.getTime()
    && left.unit === right.unit
    && String(left.content ?? "").trim() === String(right.content ?? "").trim()
    && String(left.sourceDeviceRaw ?? "").trim() === String(right.sourceDeviceRaw ?? "").trim()
    && String(left.sourcePositionRaw ?? "").trim() === String(right.sourcePositionRaw ?? "").trim()
  );
}

function sourceKeyWithRequestNumber(sourceKey: string | null, requestNumber: string) {
  if (!sourceKey) return null;
  const parts = sourceKey.split("|");
  if (parts.length < 4) return null;
  parts[3] = requestNumber.split("/")[0];
  return parts.join("|");
}

async function controlData(id: string) {
  const defect = await prisma.defect.findUnique({
    where: { id },
    select: {
      id: true,
      websiteCreated: true,
      requestNumber: true,
      requestType: true,
      sourceSpreadsheetId: true,
      sourceSheetName: true,
      sourceRow: true,
      detectedAt: true,
      unit: true,
      content: true,
      sourceDeviceRaw: true,
      sourcePositionRaw: true,
    },
  });
  if (!defect) throw fail("Không tìm thấy phiếu khiếm khuyết", 404);
  if (!defect.websiteCreated) throw fail("Chỉ phiếu tạo từ website mới có STT cấp ban đầu", 409);

  const createEvent = await prisma.defectSyncOutbox.findFirst({
    where: { defectId: defect.id, eventType: "CREATE" },
    orderBy: { createdAt: "asc" },
    select: { payload: true, createdAt: true },
  });
  const issuedRequestNumber = createEvent
    ? payloadRequestNumber(createEvent.payload)
    : defect.requestNumber ?? "";
  const candidates = defect.sourceSpreadsheetId && defect.sourceSheetName
    ? await prisma.defect.findMany({
        where: {
          id: { not: defect.id },
          sourceSpreadsheetId: defect.sourceSpreadsheetId,
          sourceSheetName: defect.sourceSheetName,
          syncState: "ACTIVE",
          cancelledAt: null,
        },
        select: {
          id: true,
          requestNumber: true,
          sourceSpreadsheetId: true,
          sourceSheetName: true,
          sourceRow: true,
          detectedAt: true,
          unit: true,
          content: true,
          sourceDeviceRaw: true,
          sourcePositionRaw: true,
        },
      })
    : [];
  const matches = candidates.filter((candidate) => sameSheetIdentity(defect, candidate));
  return {
    defectId: defect.id,
    issuedRequestNumber,
    currentRequestNumber: defect.requestNumber ?? "",
    sheetRequestNumber: matches.length === 1 ? matches[0].requestNumber ?? "" : "",
    sheetMatchAmbiguous: matches.length > 1,
    issuedAt: createEvent?.createdAt ?? null,
  };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-two-way-sync", ["manage", "full"], "Không đủ quyền đối chiếu STT phiếu");
    return ok(await controlData(params.id));
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-two-way-sync", ["manage", "full"], "Không đủ quyền điều chỉnh STT phiếu");
    if (!(await isDefectSyncFeatureEnabled("UPDATE"))) {
      return fail("Hãy bật Cập nhật Vận hành trước khi điều chỉnh STT để đồng bộ vị trí dòng trên Sheet", 503);
    }
    const body = await req.json().catch(() => ({}));
    const requestNumber = String(body?.requestNumber ?? "").trim().toUpperCase();
    if (!/^(?:QT)?\d+\/\d{4}$/.test(requestNumber)) {
      return fail("STT phải có dạng 1869/2026 hoặc QT01/2026");
    }

    const result = await prisma.$transaction(async (tx) => {
      const defect = await tx.defect.findUnique({ where: { id: params.id } });
      if (!defect) throw fail("Không tìm thấy phiếu khiếm khuyết", 404);
      if (!defect.websiteCreated) throw fail("Chỉ được điều chỉnh STT của phiếu tạo từ website", 409);
      if (!defect.requestType) throw fail("Phiếu chưa có loại yêu cầu", 409);
      const environment = defect.requestType === "Môi Trường";
      if (environment !== requestNumber.startsWith("QT")) {
        throw fail(environment ? "Phiếu Môi Trường phải dùng STT QTxx/năm" : "Loại phiếu này phải dùng STT số/năm", 409);
      }
      const oldYear = defect.requestNumber?.match(/\/(\d{4})$/)?.[1]
        ?? String(defect.detectedAt?.getFullYear() ?? "");
      const newYear = requestNumber.match(/\/(\d{4})$/)?.[1];
      if (!oldYear || newYear !== oldYear) throw fail(`STT điều chỉnh phải thuộc năm ${oldYear}`, 409);
      if (defect.requestNumber === requestNumber) throw fail("Phiếu đã mang STT này", 409);
      const processing = await tx.defectSyncOutbox.count({
        where: { defectId: defect.id, status: "PROCESSING" },
      });
      if (processing > 0) {
        throw fail("Phiếu đang được n8n xử lý; hãy chờ hoặc thu hồi hàng đợi trước khi đổi STT", 409);
      }

      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`defect-request-renumber:${defect.sourceSpreadsheetId ?? ""}:${defect.sourceSheetName ?? ""}:${requestNumber}`}, 0))::text AS "lock"`;
      const occupied = await tx.defect.findMany({
        where: {
          id: { not: defect.id },
          requestType: defect.requestType,
          requestNumber,
          cancelledAt: null,
          ...(defect.sourceSpreadsheetId ? { sourceSpreadsheetId: defect.sourceSpreadsheetId } : {}),
        },
      });
      const matching = occupied.filter((candidate) => sameSheetIdentity(defect, candidate));
      if (occupied.some((candidate) => !matching.some((item) => item.id === candidate.id))) {
        throw fail(`STT ${requestNumber} đang thuộc một phiếu khác trên website`, 409);
      }
      if (matching.length > 1) throw fail("Có nhiều phiếu cùng khớp dòng Sheet; chưa thể tự hợp nhất an toàn", 409);
      const sheetCopy = matching[0] ?? null;

      if (sheetCopy) {
        const [pendingHistory, reminderLogs, materialRequests, relatedDevices] = await Promise.all([
          tx.defectHistoryPending.count({ where: { defectId: sheetCopy.id } }),
          tx.defectReminderLog.count({ where: { defectId: sheetCopy.id } }),
          tx.defectMaterialRequest.count({ where: { defectId: sheetCopy.id } }),
          tx.defectRelatedDevice.count({ where: { defectId: sheetCopy.id } }),
        ]);
        if (pendingHistory + reminderLogs + materialRequests + relatedDevices > 0) {
          throw fail("Phiếu trùng đã phát sinh dữ liệu liên quan; chưa thể tự hợp nhất", 409);
        }
        await tx.defect.delete({ where: { id: sheetCopy.id } });
      }

      const nextSourceKey = sheetCopy?.sourceKey
        ?? sourceKeyWithRequestNumber(defect.sourceKey, requestNumber);
      const updated = await tx.defect.update({
        where: { id: defect.id },
        data: {
          requestNumber,
          sourceKey: nextSourceKey,
          sourceRow: sheetCopy?.sourceRow ?? defect.sourceRow,
          sourceHash: sheetCopy?.sourceHash ?? defect.sourceHash,
          sourceSyncedAt: sheetCopy?.sourceSyncedAt ?? defect.sourceSyncedAt,
          sourceLastSeenAt: sheetCopy?.sourceLastSeenAt ?? defect.sourceLastSeenAt,
          syncState: sheetCopy ? "ACTIVE" : defect.syncState,
        },
      });
      await enqueueDefectSyncEvent(tx, {
        defect: updated,
        eventType: "UPDATE",
        extra: { previousRequestNumber: defect.requestNumber ?? "" },
      });
      const consumedCancelledDefectId = updated.sourceSpreadsheetId && updated.sourceSheetName && updated.requestType
        ? await consumeReusableCancelledRequestNumber(tx, {
            requestNumber,
            requestType: updated.requestType,
            spreadsheetId: updated.sourceSpreadsheetId,
            sheetName: updated.sourceSheetName,
            reusedById: updated.id,
          })
        : null;

      // Nếu đây đúng là STT mới nhất vừa cấp và chưa có phiếu nào khác dùng số
      // cũ, hạ bộ đếm một nấc để lượt tạo kế tiếp nhận lại số vừa giải phóng.
      // Điều kiện currentValue chính xác ngăn việc kéo lùi dãy khi 1871, 1872…
      // đã được cấp trong lúc admin đang đối chiếu.
      const oldMatch = defect.requestNumber?.match(/^(?:QT)?(\d+)\/(\d{4})$/i);
      const newMatch = requestNumber.match(/^(?:QT)?(\d+)\/(\d{4})$/i);
      let releasedPreviousNumber = false;
      if (oldMatch && newMatch && Number(newMatch[1]) < Number(oldMatch[1])) {
        const oldStillUsed = await tx.defect.count({
          where: { requestType: defect.requestType, requestNumber: defect.requestNumber },
        });
        if (oldStillUsed === 0) {
          const released = await tx.defectRequestSequence.updateMany({
            where: {
              year: Number(oldMatch[2]),
              requestType: defect.requestType,
              currentValue: Number(oldMatch[1]),
            },
            data: { currentValue: Number(oldMatch[1]) - 1 },
          });
          releasedPreviousNumber = released.count === 1;
        }
      }
      return {
        updated,
        oldRequestNumber: defect.requestNumber,
        mergedDefectId: sheetCopy?.id ?? null,
        consumedCancelledDefectId,
        releasedPreviousNumber,
      };
    });

    await audit(
      user.id,
      "RENUMBER_WEBSITE_DEFECT",
      "Defect",
      params.id,
      auditDetailWithPosition(
        user,
        `Đổi STT từ ${result.oldRequestNumber ?? "—"} thành ${result.updated.requestNumber}`
        + (result.mergedDefectId ? `; hợp nhất phiếu Sheet ${result.mergedDefectId}` : "")
        + (result.consumedCancelledDefectId ? `; sử dụng STT đã hủy ${result.consumedCancelledDefectId}` : "")
        + (result.releasedPreviousNumber ? `; trả lại STT ${result.oldRequestNumber} cho lượt cấp kế tiếp` : "")
      )
    );
    return ok(await controlData(params.id));
  });
}
