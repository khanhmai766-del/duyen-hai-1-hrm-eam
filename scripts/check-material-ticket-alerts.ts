import assert from "node:assert/strict";
import { isPastTwoWorkingDays, materialTicketAlert } from "../lib/material-ticket-alerts";

const at = (value: string) => Date.parse(value);
const monday = "2026-09-07T09:00:00+07:00";
const friday = "2026-09-04T09:00:00+07:00";
assert.equal(isPastTwoWorkingDays(monday, at("2026-09-09T09:00:00+07:00")), false);
assert.equal(isPastTwoWorkingDays(monday, at("2026-09-09T09:00:01+07:00")), true);
assert.equal(isPastTwoWorkingDays(friday, at("2026-09-07T18:00:00+07:00")), false);
assert.equal(isPastTwoWorkingDays(friday, at("2026-09-08T09:00:01+07:00")), true);
// UTC vẫn là Chủ nhật nhưng giờ Việt Nam đã là thứ Hai.
assert.equal(isPastTwoWorkingDays("2026-09-06T18:00:00Z", at("2026-09-08T18:00:00Z")), false);
assert.equal(isPastTwoWorkingDays("2026-09-06T18:00:00Z", at("2026-09-08T18:00:01Z")), true);
assert.equal(isPastTwoWorkingDays(null, Date.now()), false);
assert.equal(isPastTwoWorkingDays("invalid", Date.now()), false);
assert.equal(isPastTwoWorkingDays(monday, at(friday)), false);

const ticket: Parameters<typeof materialTicketAlert>[0] = {
  type: "CHUA_CHON", status: "CHO_XAC_NHAN", materialCategory: null,
  createdAt: friday, confirmedAt: null, completedAt: null,
  vhvReceivedAt: null, receivedAt: null, proposalIssuedAt: null,
  proposalReceiverName: null, statsAt: null,
};
const now = at("2026-09-09T09:00:01+07:00");
assert.match(materialTicketAlert(ticket, at(friday))!, /Trưởng ca\/Trưởng kíp/);
assert.equal(materialTicketAlert({ ...ticket, type: "HOA_CHAT" }, now), null);
const statsTicket = { ...ticket, type: "DE_XUAT" as const, status: "CHO_THONG_KE", confirmedAt: monday };
assert.match(materialTicketAlert(statsTicket, now)!, /Thống kê/);
assert.equal(materialTicketAlert(statsTicket, now - 1000), null);
// Việc xuất/nhập số ĐXVT không đặt lại thời gian chờ của bước Thống kê.
assert.match(materialTicketAlert({ ...statsTicket, status: "CHO_XAC_NHAN_PHAT", statsAt: new Date(now).toISOString() }, now)!, /Thống kê/);
const receiptTicket = {
  ...statsTicket, status: "NHAN_VAT_TU", proposalReceiverName: "Nguyễn Văn A", proposalIssuedAt: monday,
};
assert.match(materialTicketAlert(receiptTicket, now)!, /vật tư lãnh/);
assert.equal(materialTicketAlert({ ...receiptTicket, proposalReceiverName: " " }, now), null);
assert.equal(materialTicketAlert({ ...receiptTicket, proposalIssuedAt: new Date(now).toISOString() }, now), null);
assert.equal(materialTicketAlert({ ...receiptTicket, receivedAt: new Date(now).toISOString() }, now), null);
for (const status of ["SU_DUNG_VAT_TU", "CHO_PHIEU_YCSC", "HOAN_TAT", "TU_CHOI"]) {
  assert.equal(materialTicketAlert({ ...receiptTicket, status }, now), null);
}
// Luồng ứng chờ Thống kê sau nghiệm thu, không tính từ ngày tạo phiếu.
assert.equal(materialTicketAlert({ ...ticket, type: "UNG", status: "NHAN_VAT_TU", completedAt: new Date(now).toISOString() }, now), null);
assert.match(materialTicketAlert({ ...ticket, type: "UNG", status: "NHAN_VAT_TU", completedAt: monday }, now)!, /Thống kê/);
console.log("Đạt: cảnh báo vật tư, hạn hai ngày làm việc, cuối tuần, múi giờ và chuyển bước.");
