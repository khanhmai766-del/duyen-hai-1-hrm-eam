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

/**
 * DÃY SỐ THỨ TỰ — mỗi tháng có HAI dãy chạy song song, đánh số độc lập từ 1.
 *
 *   MATERIAL  vật tư thông thường (dầu, lọc, bi nghiền…)
 *   CHEMICAL  hóa chất, gồm cả NH3 lỏng khai một bước
 *
 * Hai luồng này khác hẳn nhau về số bước và về người theo dõi, nên trộn chung một dãy
 * thì bên hóa chất thấy số nhảy cóc mà không hiểu vì sao.
 */
export const SEQUENCE_SCOPES = ["MATERIAL", "CHEMICAL"] as const;
export type SequenceScope = (typeof SEQUENCE_SCOPES)[number];

/** Tiền tố hiển thị — có nó thì "VT-1" và "HC-1" của cùng một tháng mới phân biệt được. */
export const SCOPE_PREFIX: Record<SequenceScope, string> = { MATERIAL: "VT", CHEMICAL: "HC" };

/**
 * Loại phiếu thuộc dãy nào. Quyết định theo `type` vì `type` được chốt NGAY LÚC TẠO từ
 * loại vật tư (xem app/api/material-tickets/route.ts) và không đổi về sau — phiếu hóa
 * chất không bao giờ đi qua trạng thái CHUA_CHON như phiếu vật tư thường.
 *
 * Bất biến này là thứ giữ cho khóa duy nhất (tháng + dãy + STT) không vỡ: cho phép đổi
 * `type` sau khi tạo là phiếu đổi dãy, mà STT của dãy mới thì đã có người khác giữ.
 */
export function sequenceScopeOfType(type: string | null | undefined): SequenceScope {
  return type === "HOA_CHAT" || type === "GHI_NHAN" ? "CHEMICAL" : "MATERIAL";
}

type MaterialTicketSequenceRef = {
  sequenceMonth: string;
  sequenceNumber: number;
  sequenceScope?: string | null;
};

function prefixOf(ticket: MaterialTicketSequenceRef) {
  return SCOPE_PREFIX[(ticket.sequenceScope as SequenceScope) ?? "MATERIAL"] ?? SCOPE_PREFIX.MATERIAL;
}

/** Số hiệu hiển thị của phiếu: "VT-7", "HC-3". */
export function materialTicketNumber(ticket: MaterialTicketSequenceRef) {
  return `${prefixOf(ticket)}-${ticket.sequenceNumber}`;
}

/** Tên hiển thị duy nhất của phiếu sau khi bỏ mã VT tự sinh. */
export function materialTicketReference(ticket: MaterialTicketSequenceRef) {
  const [year, month] = ticket.sequenceMonth.split("-");
  const monthText = year && month ? `${month}/${year}` : ticket.sequenceMonth;
  return `STT ${materialTicketNumber(ticket)} tháng ${monthText}`;
}

/**
 * Định danh kỹ thuật an toàn để đặt tên file, không phải mã nghiệp vụ.
 *
 * Có tiền tố dãy vì từ khi tách dãy, "stt-1" của tháng 8 ứng với HAI phiếu khác nhau —
 * thiếu nó thì hai bộ biên bản ghi đè lên nhau trên kho tệp.
 */
export function materialTicketFileBase(ticket: MaterialTicketSequenceRef) {
  return `phieu-vat-tu-${ticket.sequenceMonth}-${prefixOf(ticket).toLowerCase()}-${ticket.sequenceNumber}`;
}
