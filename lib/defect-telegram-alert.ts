import { DEFECT_STATUS, type DefectStatusKey } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { deliverTelegramNotification, escapeTelegramHtml } from "@/lib/telegram";
import { formatVietnamDateTime } from "@/lib/vietnam-time";

const ALERT_SELECT = {
  id: true,
  unit: true,
  requestNumber: true,
  severity: true,
  status: true,
  content: true,
  device: true,
  sourceDeviceRaw: true,
  detectedAt: true,
  createdAt: true,
  updatedAt: true,
  postRepairAwaitingMaterial: true,
  cancelledAt: true,
  node: { select: { name: true } },
} as const;

export type LevelOneDefectSnapshot = {
  id: string;
  severity: string | null;
  status: string;
  postRepairAwaitingMaterial: boolean;
  cancelledAt: Date | null;
};

type AlertDefect = Awaited<ReturnType<typeof loadAlertDefect>>;

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://duyenhai1.vn").replace(/\/$/, "");
}

function normalized(value: string | null | undefined, fallback = "—") {
  return value?.replace(/\s+/g, " ").trim() || fallback;
}

function shorten(value: string | null | undefined, maxLength = 180) {
  const text = normalized(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

function statusLabel(value: string) {
  return DEFECT_STATUS[value as DefectStatusKey]?.label ?? value;
}

async function loadAlertDefect(defectId: string) {
  return prisma.defect.findUnique({ where: { id: defectId }, select: ALERT_SELECT });
}

function transitionOf(before: LevelOneDefectSnapshot | null, after: NonNullable<AlertDefect>) {
  if (!before) {
    return after.severity === "1" && !after.cancelledAt
      ? { key: "new", title: "🚨 KHIẾM KHUYẾT MỨC 1 MỚI", detail: "Phiếu vừa được ghi nhận ở Mức 1." }
      : null;
  }
  if (before.severity !== "1" && after.severity === "1" && !after.cancelledAt) {
    return { key: "upgraded", title: "⬆️ KHIẾM KHUYẾT ĐƯỢC NÂNG LÊN MỨC 1", detail: "Mức độ vừa được thay đổi thành Mức 1." };
  }
  if (before.severity === "1" && after.severity !== "1") {
    return { key: `downgraded-${after.severity ?? "none"}`, title: "↘️ KHIẾM KHUYẾT KHÔNG CÒN Ở MỨC 1", detail: `Mức mới: ${after.severity ?? "chưa phân loại"}.` };
  }
  if (before.severity !== "1" || after.severity !== "1") return null;
  if (!before.cancelledAt && after.cancelledAt) {
    return { key: "cancelled", title: "⛔ KHIẾM KHUYẾT MỨC 1 ĐÃ HỦY", detail: "Phiếu vừa được chuyển sang trạng thái hủy." };
  }
  if (before.status !== after.status) {
    if (after.status === "DA_XU_LY") {
      return { key: "completed", title: "✅ KHIẾM KHUYẾT MỨC 1 ĐÃ XỬ LÝ XONG", detail: "Phiếu vừa được đánh dấu đã xử lý xong." };
    }
    if (before.status === "DA_XU_LY") {
      return { key: `reopened-${after.status}`, title: "🔄 KHIẾM KHUYẾT MỨC 1 ĐƯỢC MỞ LẠI", detail: `Trạng thái mới: ${statusLabel(after.status)}.` };
    }
    return {
      key: `status-${after.status}`,
      title: "🔔 KHIẾM KHUYẾT MỨC 1 THAY ĐỔI TRẠNG THÁI",
      detail: `${statusLabel(before.status)} → ${statusLabel(after.status)}.`,
    };
  }
  if (before.postRepairAwaitingMaterial !== after.postRepairAwaitingMaterial) {
    return after.postRepairAwaitingMaterial
      ? { key: "awaiting-material", title: "⏳ KHIẾM KHUYẾT MỨC 1 CHỜ VẬT TƯ SAU XỬ LÝ", detail: "Phiếu đã xử lý nhưng vẫn được giữ tồn đọng để chờ vật tư." }
      : { key: "material-cleared", title: "✅ KHIẾM KHUYẾT MỨC 1 ĐÃ BỎ TRẠNG THÁI CHỜ VẬT TƯ", detail: "Phiếu không còn được giữ tồn đọng do chờ vật tư." };
  }
  return null;
}

export async function notifyLevelOneDefectChange(params: {
  defectId: string;
  before: LevelOneDefectSnapshot | null;
  actorName?: string | null;
}) {
  try {
    const after = await loadAlertDefect(params.defectId);
    if (!after) return null;
    const transition = transitionOf(params.before, after);
    if (!transition) return null;
    const device = normalized(after.node?.name ?? after.sourceDeviceRaw ?? after.device, "Chưa gắn thiết bị");
    const lines = [
      `<b>${escapeTelegramHtml(transition.title)}</b>`,
      "",
      `Số YC: <b>${escapeTelegramHtml(normalized(after.requestNumber, "Chưa có số YC"))}</b>`,
      `Đơn vị: ${escapeTelegramHtml(after.unit)}`,
      `Thiết bị: ${escapeTelegramHtml(device)}`,
      `Trạng thái: ${escapeTelegramHtml(after.postRepairAwaitingMaterial ? "Chờ vật tư sau xử lý" : statusLabel(after.status))}`,
      `Nội dung: ${escapeTelegramHtml(shorten(after.content))}`,
      `Thời gian: ${escapeTelegramHtml(formatVietnamDateTime(after.updatedAt))}`,
      params.actorName ? `Nguồn cập nhật: ${escapeTelegramHtml(params.actorName)}` : null,
      `Ghi nhận: ${escapeTelegramHtml(transition.detail)}`,
      "",
      `<a href="${escapeTelegramHtml(`${appUrl()}/defects`)}">Xem trên hệ thống</a>`,
    ].filter((line): line is string => line !== null);
    return deliverTelegramNotification({
      type: "DEFECT_LEVEL_ONE_EVENT",
      periodKey: `${after.id}:${transition.key}:${after.updatedAt.toISOString()}`,
      message: lines.join("\n"),
    });
  } catch (error) {
    console.error("[telegram level-one] Không gửi được cảnh báo khiếm khuyết", error);
    return null;
  }
}
