import { createHash, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { defectSheetPositionLabel } from "@/lib/defect-position-sheet-labels";
import { DEFECT_SYNC_FEATURES } from "@/lib/defect-two-way-sync";

export const DEFECT_SYNC_EVENT_TYPES = ["CREATE", "UPDATE", "REMIND"] as const;
export type DefectSyncEventType = (typeof DEFECT_SYNC_EVENT_TYPES)[number];

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
      return tx.defectSyncOutbox.update({
        where: { id: pending.id },
        data: {
          payload: defectSheetPayload(params.defect, params.extra),
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
