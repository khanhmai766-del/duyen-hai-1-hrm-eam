import type { MaterialTicket } from "@/hooks/useMaterialTickets";
import { CHEMICAL_TICKET_TYPE, isGasCylinderTicket, OTHER_MATERIAL_TICKET_TYPE, OTHER_MATERIAL_ADVANCE_TICKET_TYPE } from "@/lib/constants";

type AlertTicket = Pick<MaterialTicket,
  "type" | "status" | "materialCategory" | "createdAt" | "confirmedAt" |
  "completedAt" | "vhvReceivedAt" | "receivedAt" | "proposalIssuedAt" |
  "proposalReceiverName" | "statsAt"
>;

// Cộng hai ngày làm việc, giữ nguyên giờ Việt Nam; bỏ thứ Bảy/Chủ nhật,
// chưa trừ ngày lễ. Chỉ cảnh báo sau hạn, không cảnh báo đúng thời điểm hết hạn.
export function isPastTwoWorkingDays(start: string | null, now: number): boolean {
  if (!start) return false;
  const vietnamOffset = 7 * 60 * 60 * 1000;
  const deadline = new Date(Date.parse(start) + vietnamOffset);
  if (!Number.isFinite(deadline.getTime())) return false;
  let remaining = 2;
  while (remaining > 0) {
    deadline.setUTCDate(deadline.getUTCDate() + 1);
    if (deadline.getUTCDay() !== 0 && deadline.getUTCDay() !== 6) remaining--;
  }
  return now > deadline.getTime() - vietnamOffset;
}

export function materialTicketAlert(ticket: AlertTicket, now = Date.now()): string | null {
  if (ticket.status === "CHO_XAC_NHAN" && ["CHUA_CHON", "DE_XUAT", "UNG"].includes(ticket.type)) {
    return "Trưởng ca/Trưởng kíp chưa xác nhận đề xuất";
  }

  let statsStartedAt: string | null = null;
  if (["CHO_THONG_KE", "CHO_PHIEU__XUAT_KHO", "CHO_XAC_NHAN_PHAT"].includes(ticket.status)) {
    if (ticket.type === "DE_XUAT" || ticket.type === CHEMICAL_TICKET_TYPE) {
      statsStartedAt = ticket.confirmedAt;
    } else if (ticket.type === "UNG") {
      statsStartedAt = isGasCylinderTicket(ticket.materialCategory) ? ticket.vhvReceivedAt : ticket.completedAt;
    } else if (ticket.type === OTHER_MATERIAL_TICKET_TYPE) {
      statsStartedAt = ticket.createdAt;
    } else if (ticket.type === OTHER_MATERIAL_ADVANCE_TICKET_TYPE) {
      statsStartedAt = ticket.receivedAt;
    }
  } else if (ticket.type === "UNG" && ticket.status === "NHAN_VAT_TU") {
    statsStartedAt = isGasCylinderTicket(ticket.materialCategory) ? ticket.vhvReceivedAt : ticket.completedAt;
  }
  if (isPastTwoWorkingDays(statsStartedAt, now)) {
    return "Thống kê chưa xác nhận ĐXVT · Quá 2 ngày làm việc";
  }

  if (ticket.type === "DE_XUAT" && ticket.status === "NHAN_VAT_TU"
    && ticket.proposalReceiverName?.trim() && !ticket.receivedAt
    && isPastTwoWorkingDays(ticket.proposalIssuedAt ?? ticket.statsAt, now)) {
    return "Chưa xác nhận vật tư lãnh · Quá 2 ngày làm việc từ khi giao VHV";
  }
  return null;
}
