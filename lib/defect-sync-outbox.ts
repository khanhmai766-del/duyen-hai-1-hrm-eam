import { createHash, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { defectSheetPositionLabel } from "@/lib/defect-position-sheet-labels";
import { DEFECT_SYNC_FEATURES } from "@/lib/defect-two-way-sync";

export const DEFECT_SYNC_EVENT_TYPES = ["CREATE", "UPDATE", "REMIND"] as const;
export type DefectSyncEventType = (typeof DEFECT_SYNC_EVENT_TYPES)[number];

function mergedUpdateWriteScope(existing: string | undefined, incoming: string | undefined) {
  if (!existing || !incoming) return undefined;
  const hasCorrection = [existing, incoming].some((scope) =>
    scope === "SOURCE_CORRECTION_ONLY" || scope === "SHEET_ORIGIN_WITH_CORRECTION"
  );
  const hasOperation = [existing, incoming].some((scope) =>
    scope === "SHEET_ORIGIN_LIMITED" || scope === "SHEET_ORIGIN_WITH_CORRECTION"
  );
  if (hasCorrection && hasOperation) return "SHEET_ORIGIN_WITH_CORRECTION";
  if (hasCorrection) return "SOURCE_CORRECTION_ONLY";
  if (hasOperation) return "SHEET_ORIGIN_LIMITED";
  return "NOTE_ONLY";
}

export function verifyDefectOutboxToken(authorization: string | null) {
  const expected = (
    process.env.N8N_DEFECT_TWO_WAY_SYNC_TOKEN
    || process.env.N8N_DEFECT_SYNC_TOKEN
    || ""
  ).trim();
  const received = authorization?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!expected || !received) return false;
  const expectedHash = createHash("sha256").update(expected).digest();
  const receivedHash = createHash("sha256").update(received).digest();
  return timingSafeEqual(expectedHash, receivedHash);
}

type SheetDefect = {
  id: string;
  requestNumber: string | null;
  requestType: string | null;
  unit: string;
  commonSubUnit: string | null;
  sourceDeviceRaw: string | null;
  device: string | null;
  system: string | null;
  content: string | null;
  detectedAt: Date | null;
  shiftLeaderName: string | null;
  reminderCount: number;
  repeatedRepairRaw: string | null;
  fireSafetyImpact: string | null;
  environmentSafetyImpact: string | null;
  severity: string | null;
  condition: string | null;
  status: string;
  note: string | null;
  sourceSpreadsheetId?: string | null;
  sourceSheetName?: string | null;
};

function shortShiftLeaderName(value: string | null) {
  const parts = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(-2).join(" ");
}

export function defectSheetPayload(
  defect: SheetDefect,
  extra?: Record<string, Prisma.InputJsonValue | undefined>
): Prisma.InputJsonObject {
  const sheetUnit = defect.unit === "COMMON" ? defect.commonSubUnit ?? "CHUNG" : defect.unit;
  return {
    defectId: defect.id,
    requestNumber: defect.requestNumber ?? "",
    requestType: defect.requestType ?? "",
    // Phiếu có nguồn gốc Sheet phải quay lại đúng workbook/tab ban đầu. Hai
    // trường này cũng giúp phân biệt hai tab Môi Trường cùng dùng requestType.
    sourceSpreadsheetId: defect.sourceSpreadsheetId ?? "",
    sourceSheetName: defect.sourceSheetName ?? "",
    unit: sheetUnit,
    device: defect.sourceDeviceRaw || defect.device || "",
    position: defectSheetPositionLabel(defect.system, defect.unit) ?? defect.system ?? "",
    content: defect.content ?? "",
    detectedAt: defect.detectedAt?.toISOString() ?? "",
    shiftLeader: shortShiftLeaderName(defect.shiftLeaderName),
    reminderCount: defect.reminderCount,
    repeatedRepair: defect.repeatedRepairRaw ?? "",
    fireSafetyImpact: defect.fireSafetyImpact ?? "",
    environmentSafetyImpact: defect.environmentSafetyImpact ?? "",
    severity: defect.severity ?? "",
    condition: defect.condition ?? "",
    status: defect.status,
    note: defect.note ?? "",
    ...extra,
  };
}

/**
 * Ghi sự kiện trong cùng transaction thay đổi nghiệp vụ. Khi cờ hai chiều tắt,
 * không tạo sự kiện. n8n sẽ claim/ack sự kiện qua API riêng và có thể retry an toàn.
 */
export async function enqueueDefectSyncEvent(
  tx: Prisma.TransactionClient,
  params: {
    defect: SheetDefect;
    eventType: DefectSyncEventType;
    extra?: Record<string, Prisma.InputJsonValue | undefined>;
  }
) {
  const setting = await tx.defectSyncSetting.findUnique({ where: { id: "singleton" } });
  const featureKey = DEFECT_SYNC_FEATURES[params.eventType];
  if (!setting?.twoWaySyncEnabled || !setting[featureKey]) return null;

  // Khi người dùng bấm lưu nhiều lần trước lúc n8n chạy, chỉ cần ghi trạng thái
  // mới nhất. Nếu CREATE còn chờ thì cập nhật luôn snapshot CREATE; nếu đã có
  // UPDATE đang chờ thì thay snapshot cũ, tránh bắt người vận hành Execute nhiều
  // lượt và tránh một UPDATE cũ ghi đè UPDATE mới.
  if (params.eventType === "UPDATE") {
    const pending = await tx.defectSyncOutbox.findFirst({
      where: {
        defectId: params.defect.id,
        eventType: { in: ["CREATE", "UPDATE"] },
        status: { in: ["PENDING", "FAILED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (pending) {
      const pendingPayload = pending.payload && typeof pending.payload === "object" && !Array.isArray(pending.payload)
        ? pending.payload as Prisma.JsonObject
        : {};
      const incomingScope = params.extra?.writeScope;
      const pendingScope = typeof pendingPayload.writeScope === "string"
        ? pendingPayload.writeScope
        : undefined;
      // Sửa riêng ghi chú có thể diễn ra ngay sau khi bấm Lưu lịch sử, lúc sự
      // kiện UPDATE/CREATE trước vẫn chưa chạy. Khi gộp, giữ phạm vi rộng hơn
      // của sự kiện cũ để không làm mất cập nhật trạng thái; payload vẫn lấy dữ
      // liệu mới nhất nên cột O cũng được cập nhật đúng.
      let mergedExtra = params.extra;
      if (pending.eventType === "CREATE") {
        const { writeScope: _incomingScope, ...otherExtra } = params.extra ?? {};
        mergedExtra = otherExtra;
      } else if (pendingScope || typeof incomingScope === "string") {
        const { writeScope: _incomingScope, ...otherExtra } = params.extra ?? {};
        const writeScope = mergedUpdateWriteScope(
          pendingScope,
          typeof incomingScope === "string" ? incomingScope : undefined
        );
        mergedExtra = { ...otherExtra, ...(writeScope ? { writeScope } : {}) };
      }
      return tx.defectSyncOutbox.update({
        where: { id: pending.id },
        data: {
          payload: defectSheetPayload(params.defect, mergedExtra),
          status: "PENDING",
          nextAttemptAt: new Date(),
          claimedAt: null,
          completedAt: null,
          lastError: null,
        },
      });
    }
  }

  return tx.defectSyncOutbox.create({
    data: {
      defectId: params.defect.id,
      eventType: params.eventType,
      payload: defectSheetPayload(params.defect, params.extra),
    },
  });
}
