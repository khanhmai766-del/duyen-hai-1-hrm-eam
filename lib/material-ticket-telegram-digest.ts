import { prisma } from "@/lib/prisma";
import { deliverTelegramNotification, escapeTelegramHtml } from "@/lib/telegram";
import { vietnamDayKey, formatVietnamDate } from "@/lib/vietnam-time";
import { materialTicketAlert } from "@/lib/material-ticket-alerts";
import { materialTicketNeedsRecoveryHandover, materialTicketAwaitsRecoveryDocSignature, RECOVERY_HANDOVER_STATUS } from "@/lib/constants";
import { materialTicketReference } from "@/lib/material-ticket-sequence";
import { materialTicketStatusLabel } from "@/lib/material-ticket-status-labels";

const LIST_MAX_ITEMS = 15;

const IDENTITY_SELECT = {
  id: true,
  sequenceMonth: true,
  sequenceNumber: true,
  sequenceScope: true,
  unit: true,
  assignedPosition: true,
  status: true,
} as const;

type IdentityRow = { sequenceMonth: string; sequenceNumber: number; sequenceScope: string | null; unit: string; assignedPosition: string; status: string };

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://duyenhai1.vn").replace(/\/$/, "");
}

function ticketLine(ticket: IdentityRow, extra?: string) {
  const base = `<b>${escapeTelegramHtml(materialTicketReference(ticket))}</b> · ${escapeTelegramHtml(ticket.unit)} · ${escapeTelegramHtml(ticket.assignedPosition)} · ${escapeTelegramHtml(materialTicketStatusLabel(ticket.status))}`;
  return extra ? `${base}\n${escapeTelegramHtml(extra)}` : base;
}

/** "12/2026" — số văn bản BBTHVT đã cấp, để người trả/nhận biên bản đối chiếu đúng tờ giấy. */
function recoveryDocNumberOf(ticket: { recoveryDocNo: number | null; recoveryDocNoYear: number | null }) {
  if (ticket.recoveryDocNo == null) return "Chưa cấp số BBTHVT";
  return `Số BBTHVT: ${ticket.recoveryDocNo}${ticket.recoveryDocNoYear ? `/${ticket.recoveryDocNoYear}` : ""}`;
}

function renderSection(title: string, rows: Array<{ ticket: IdentityRow; note?: string }>) {
  const lines = [`${title}: <b>${rows.length} phiếu</b>`];
  if (rows.length === 0) {
    lines.push("Không có phiếu nào.");
    return lines;
  }
  const shown = rows.slice(0, LIST_MAX_ITEMS);
  lines.push("", ...shown.map((row, index) => `${index + 1}. ${ticketLine(row.ticket, row.note)}`));
  if (rows.length > shown.length) lines.push("", `… và ${rows.length - shown.length} phiếu khác.`);
  return lines;
}

export async function buildMaterialTicketAttentionDigest(now: Date = new Date()) {
  const [alertCandidates, recoveryCandidates] = await Promise.all([
    prisma.materialTicket.findMany({
      where: { status: { notIn: ["HOAN_TAT", "TU_CHOI"] } },
      select: {
        ...IDENTITY_SELECT,
        type: true,
        materialCategory: true,
        createdAt: true,
        confirmedAt: true,
        completedAt: true,
        vhvReceivedAt: true,
        receivedAt: true,
        proposalIssuedAt: true,
        proposalReceiverName: true,
        statsAt: true,
      },
    }),
    prisma.materialTicket.findMany({
      where: { recoveryDocSignedAt: null },
      select: {
        ...IDENTITY_SELECT,
        recoveryRequired: true,
        proposalNote: true,
        materialCategory: true,
        recoveryDocSentAt: true,
        recoveryDocSignedAt: true,
        recoveryDocNo: true,
        recoveryDocNoYear: true,
      },
    }),
  ]);

  const overdue = alertCandidates.flatMap((ticket) => {
    const reason = materialTicketAlert({
      type: ticket.type as Parameters<typeof materialTicketAlert>[0]["type"],
      status: ticket.status,
      materialCategory: ticket.materialCategory,
      createdAt: ticket.createdAt.toISOString(),
      confirmedAt: ticket.confirmedAt?.toISOString() ?? null,
      completedAt: ticket.completedAt?.toISOString() ?? null,
      vhvReceivedAt: ticket.vhvReceivedAt?.toISOString() ?? null,
      receivedAt: ticket.receivedAt?.toISOString() ?? null,
      proposalIssuedAt: ticket.proposalIssuedAt?.toISOString() ?? null,
      proposalReceiverName: ticket.proposalReceiverName,
      statsAt: ticket.statsAt?.toISOString() ?? null,
    }, now.getTime());
    return reason ? [{ ticket, note: reason }] : [];
  });
  // Chặng 1 chỉ thực sự "còn nợ" khi phiếu đang đứng ĐÚNG bước Trả phiếu vật tư thu hồi —
  // materialTicketNeedsRecoveryHandover() không tự kiểm tra status (nó còn được gọi ở nơi
  // khác để QUYẾT ĐỊNH có rẽ vào bước này hay không), nên phiếu chưa tới bước này cũng có
  // recoveryDocSentAt = null và sẽ bị tính nhầm là "cần chú ý" nếu thiếu điều kiện status.
  const needsHandover = recoveryCandidates.flatMap((ticket) =>
    ticket.status === RECOVERY_HANDOVER_STATUS && materialTicketNeedsRecoveryHandover(ticket)
      ? [{ ticket, note: recoveryDocNumberOf(ticket) }]
      : []
  );
  const awaitsSignature = recoveryCandidates.flatMap((ticket) =>
    materialTicketAwaitsRecoveryDocSignature(ticket)
      ? [{ ticket, note: recoveryDocNumberOf(ticket) }]
      : []
  );

  const lines = [
    "📦 <b>PHIẾU VẬT TƯ CẦN CHÚ Ý</b>",
    `Thời điểm: 07:00 ngày ${escapeTelegramHtml(formatVietnamDate(now))}`,
    "",
    ...renderSection("⚠️ Cảnh báo trễ hạn", overdue),
    "",
    ...renderSection("📋 Chưa đem biên bản thu hồi sang kho", needsHandover),
    "",
    ...renderSection("📋 Đã đem đi, chờ kho ký trả lại", awaitsSignature),
    "",
    `<a href="${escapeTelegramHtml(`${appUrl()}/replacement-procedures`)}">Xem trên hệ thống</a>`,
  ];

  return {
    message: lines.join("\n"),
    overdueCount: overdue.length,
    needsHandoverCount: needsHandover.length,
    awaitsSignatureCount: awaitsSignature.length,
    periodKey: vietnamDayKey(now),
  };
}

export async function runMaterialTicketAttentionDigest(params?: { now?: Date; dryRun?: boolean }) {
  const digest = await buildMaterialTicketAttentionDigest(params?.now);
  const delivery = await deliverTelegramNotification({
    type: "MATERIAL_TICKET_ATTENTION_DIGEST",
    periodKey: digest.periodKey,
    message: digest.message,
    dryRun: params?.dryRun,
    now: params?.now,
  });
  return { ...digest, delivery };
}
