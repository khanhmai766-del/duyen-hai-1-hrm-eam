export const MATERIAL_TICKET_TIME_ZONE = "Asia/Ho_Chi_Minh";

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Khóa tháng theo giờ Việt Nam, dùng chung cho STT và bộ lọc phiếu vật tư. */
export function materialTicketMonthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MATERIAL_TICKET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Không thể xác định tháng của phiếu vật tư");
  return `${year}-${month}`;
}

export function isMaterialTicketMonthKey(value: string) {
  return MONTH_KEY_PATTERN.test(value);
}

export function materialTicketMonthLabel(value: string) {
  if (!isMaterialTicketMonthKey(value)) return value;
  const [year, month] = value.split("-");
  return `Tháng ${month}/${year}`;
}

type MaterialTicketSequenceRef = {
  sequenceMonth: string;
  sequenceNumber: number;
};

/** Tên hiển thị duy nhất của phiếu sau khi bỏ mã VT tự sinh. */
export function materialTicketReference(ticket: MaterialTicketSequenceRef) {
  const [year, month] = ticket.sequenceMonth.split("-");
  const monthText = year && month ? `${month}/${year}` : ticket.sequenceMonth;
  return `STT ${ticket.sequenceNumber} tháng ${monthText}`;
}

/** Định danh kỹ thuật an toàn để đặt tên file, không phải mã nghiệp vụ. */
export function materialTicketFileBase(ticket: MaterialTicketSequenceRef) {
  return `phieu-vat-tu-${ticket.sequenceMonth}-stt-${ticket.sequenceNumber}`;
}
