import { prisma } from "@/lib/prisma";
import { deliverTelegramNotification, escapeTelegramHtml } from "@/lib/telegram";
import { formatVietnamDateTime } from "@/lib/vietnam-time";
import { materialTicketReference } from "@/lib/material-ticket-sequence";
import { materialTicketStatusLabel } from "@/lib/material-ticket-status-labels";

/**
 * Nhãn tiếng Việt cho từng action của PUT /api/material-tickets/[id]. Action nào
 * không có mặt ở đây thì notifyMaterialTicketStep() bỏ qua, không gửi gì —
 * dùng cho "editInfo"/"editStep" (chỉnh sửa/đính chính, không phải tiến một
 * bước thật) và "repairRequest" (route đã khoá, luôn trả lỗi trước khi audit).
 */
const ACTION_LABEL: Record<string, string> = {
  create: "🆕 Tạo phiếu vật tư mới",
  propose: "📝 Đã gửi đề xuất vật tư",
  confirm: "✅ Trưởng ca/Trưởng kíp đã xác nhận",
  reject: "⛔ Đã từ chối phiếu",
  vhvReceive: "📦 VHV đã lãnh vật tư (Ứng)",
  receiveExisting: "📥 Đã nhận vật tư hiện có",
  receive: "📥 Đã xác nhận nhận vật tư",
  otherAdvanceReceive: "📥 Vật tư khác (Ứng): đã lãnh vật tư",
  otherAdvanceApprove: "✅ Vật tư khác (Ứng): Thống kê duyệt — hoàn tất",
  otherApprove: "✅ Vật tư khác: Thống kê duyệt đề xuất",
  otherReceive: "📥 Vật tư khác: đã lãnh vật tư — hoàn tất",
  linkDefect: "🔧 Đã tạo SYC sửa chữa từ phiếu",
  adoptDefect: "🔧 Đã gắn SYC có sẵn vào phiếu",
  skipRepairRequest: "⏭️ Bỏ qua ra SYC — chuyển sang sử dụng vật tư",
  statsExportProposal: "📄 Thống kê đã xuất phiếu Đề xuất (ĐXVT)",
  statsExportAdvanceBbntDo: "📄 Thống kê đã xuất BBTHVT (Ứng)",
  stats: "📄 Thống kê đã xác nhận/giao phiếu",
  chemicalTrucks: "🚚 Đã ghi nhận chuyến xe hóa chất",
  use: "🔨 Đã sử dụng vật tư",
  returnItems: "↩️ Đã trả chai khí — hoàn tất",
  accept: "🔍 Đã nghiệm thu",
  statsExportDocuments: "📄 Thống kê đã xuất biên bản (BBNT/BBTHVT)",
  recoveryHandover: "📋 Đã đem biên bản thu hồi sang kho",
  recoveryDocSigned: "📋 Kho đã ký trả lại biên bản thu hồi",
  settle: "💰 Quyết toán — hoàn tất phiếu",
};

const ALERT_SELECT = {
  id: true,
  sequenceMonth: true,
  sequenceNumber: true,
  sequenceScope: true,
  unit: true,
  assignedPosition: true,
  materialCategory: true,
  status: true,
  updatedAt: true,
  recoveryDocNo: true,
  recoveryDocNoYear: true,
  items: { select: { erpName: true }, orderBy: { id: "asc" as const }, take: 1 },
  _count: { select: { items: true } },
} as const;

const RECOVERY_DOC_ACTIONS = new Set(["recoveryHandover", "recoveryDocSigned"]);

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://duyenhai1.vn").replace(/\/$/, "");
}

export async function notifyMaterialTicketStep(params: {
  ticketId: string;
  action: string;
  actorName?: string | null;
}) {
  try {
    const title = ACTION_LABEL[params.action];
    if (!title) return null;
    const ticket = await prisma.materialTicket.findUnique({
      where: { id: params.ticketId },
      select: ALERT_SELECT,
    });
    if (!ticket) return null;

    const firstItem = ticket.items[0]?.erpName?.trim();
    const extraItems = ticket._count.items - ticket.items.length;
    const materialText = [ticket.materialCategory, firstItem].filter(Boolean).join(" · ")
      || "Chưa chọn vật tư";
    const materialLine = extraItems > 0 ? `${materialText} (và ${extraItems} vật tư khác)` : materialText;

    const lines = [
      `<b>${escapeTelegramHtml(title)}</b>`,
      "",
      `Phiếu: <b>${escapeTelegramHtml(materialTicketReference(ticket))}</b>`,
      `Đơn vị: ${escapeTelegramHtml(ticket.unit)}`,
      `Cương vị: ${escapeTelegramHtml(ticket.assignedPosition)}`,
      `Vật tư: ${escapeTelegramHtml(materialLine)}`,
      `Trạng thái: ${escapeTelegramHtml(materialTicketStatusLabel(ticket.status))}`,
      RECOVERY_DOC_ACTIONS.has(params.action)
        ? `Số BBTHVT: ${escapeTelegramHtml(ticket.recoveryDocNo != null ? `${ticket.recoveryDocNo}${ticket.recoveryDocNoYear ? `/${ticket.recoveryDocNoYear}` : ""}` : "Chưa cấp số")}`
        : null,
      params.actorName ? `Người thao tác: ${escapeTelegramHtml(params.actorName)}` : null,
      `Đồng bộ lúc: ${escapeTelegramHtml(formatVietnamDateTime(ticket.updatedAt))}`,
      "",
      `<a href="${escapeTelegramHtml(`${appUrl()}/replacement-procedures`)}">Xem trên hệ thống</a>`,
    ].filter((line): line is string => line !== null);

    return await deliverTelegramNotification({
      type: "MATERIAL_TICKET_EVENT",
      periodKey: `${ticket.id}:${params.action}:${ticket.updatedAt.toISOString()}`,
      message: lines.join("\n"),
    });
  } catch (error) {
    console.error("[telegram material-ticket] Không gửi được thông báo bước phiếu vật tư", error);
    return null;
  }
}
