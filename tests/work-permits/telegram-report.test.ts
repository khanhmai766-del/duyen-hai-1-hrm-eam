import assert from "node:assert/strict";
import test from "node:test";
import { buildOverhaulDailyMessage, buildOverhaulSessionMessage, changedTelegramProgress, openingDueAt, sessionTelegramWorkerCount, splitOverhaulTelegramMessage, type ProgressBaseline, type TelegramPermit, type TelegramSession } from "../../lib/work-permit-telegram-report";
import { terminalMessageForChat } from "../../lib/server/work-permit-telegram";

const permit: TelegramPermit = { id: "pct-1", number: "4299", year: 2026, content: "Đại tu <bơm> & kiểm tra", teamName: "Nhà thầu A", teamType: "CONTRACTOR", contractorScope: "OVERHAUL", position: "Lò phó" };
const at = (time: string) => new Date(`2026-10-12T${time}+07:00`);
const item = { source: "BOILER" as const, sheet: "Lò phó - Cơ", code: "1.1", done: true, percent: 50, note: "Đã thay bạc" };
const baseline: ProgressBaseline[] = [{ ...item, percent: 30 }];
const session: TelegramSession = { id: "session-1", commanderId: "commander", commanderCode: "CH1", commanderName: "Nguyễn Văn A", company: "Nhà thầu A",
  openedAt: at("08:00:00"), endedAt: at("08:45:00"), endNote: "Thu dọn xong", itemProgress: [item], members: [
    { personId: "w1", code: "001", name: "Một", company: "Nhà thầu A", attendance: [{ in: at("08:10:00").toISOString(), out: at("08:40:00").toISOString() }] },
    { personId: "w1", code: "001", name: "Một", company: "Nhà thầu A", attendance: [{ in: at("08:20:00").toISOString(), out: at("08:40:00").toISOString() }] },
    { personId: "w2", code: "002", name: "Hai", company: "Nhà thầu A", attendance: [] },
    { personId: "commander", code: "CH1", name: "Nguyễn Văn A", company: "Nhà thầu A" },
  ] };

test("Lịch mở đúng một giờ sau giờ cho phép, kể cả qua 0h", () => {
  assert.equal(openingDueAt(at("08:00:00")).getTime(), at("09:00:00").getTime());
  assert.equal(openingDueAt(at("23:30:00")).toISOString(), "2026-10-12T17:30:00.000Z");
});
test("Báo kết thúc đếm người đã ra, không trùng người và không gồm CHTT/người chưa vào", () => {
  assert.equal(sessionTelegramWorkerCount(session, at("09:00:00")), 1);
});
test("Đếm lượt vào ngày kế tiếp dù lần làm việc dưới 24 giờ", () => {
  const overnight = { ...session, openedAt: at("23:00:00"), endedAt: new Date("2026-10-13T02:00:00+07:00"), members: [
    { personId: "w3", code: "003", name: "Ba", company: "Nhà thầu A", attendance: [{ in: "2026-10-13T01:00:00+07:00", out: "2026-10-13T01:30:00+07:00" }] },
  ] };
  assert.equal(sessionTelegramWorkerCount(overnight, overnight.endedAt), 1);
});
test("Bản tin gộp có mở/kết thúc, số hiệu đầy đủ, tiến độ trước/sau; escape HTML", () => {
  const message = buildOverhaulSessionMessage(permit, session, "COMBINED", baseline, at("09:00:00"));
  assert.match(message, /MỞ VÀ KẾT THÚC/);
  assert.match(message, /4299\/2026\/VH1-NĐDH/);
  assert.match(message, /30% → <b>50%<\/b>/);
  assert.match(message, /Đã thay bạc/);
  assert.match(message, /&lt;bơm&gt; &amp;/);
  assert.match(message, /Số nhân viên công tác: <b>1<\/b>/);
  assert.match(message, /Cương vị cho phép: Lò phó/);
  assert.doesNotMatch(message, /Tổ máy/);
});
test("Chỉ đưa hạng mục đổi %/ghi chú, so với lúc mở chứ không so với cập nhật giữa chừng", () => {
  assert.equal(changedTelegramProgress({ ...session, itemProgress: [{ ...item, percent: 30, note: "" }] }, baseline).length, 0);
  assert.equal(changedTelegramProgress(session, baseline)[0].before, 30);
  assert.equal(changedTelegramProgress({ ...session, itemProgress: [{ ...item, done: false }] }, baseline).length, 0);
});
test("Từng nhóm nhận bản kết thúc hoặc bản gộp theo việc đã nhận mở ngày", () => {
  assert.equal(terminalMessageForChat(true, "kết thúc", "gộp"), "kết thúc");
  assert.equal(terminalMessageForChat(false, "kết thúc", "gộp"), "gộp");
});
test("Tổng hợp dùng danh sách số hiệu PCT, không đếm phiếu, không tách CHTT, bỏ nhà thầu không làm", () => {
  const message = buildOverhaulDailyMessage("2026-10-12", [
    { company: "Nhà thầu A", totalPersonnel: 100, worked: 30, permitNumbers: ["4299/2026/VH1-NĐDH", "4299/2026/VH1-NĐDH", "4300/2026/VH1-NĐDH"] },
    { company: "Không làm", totalPersonnel: 50, worked: 0, permitNumbers: [] },
  ]);
  assert.equal(message.split("4299/2026/VH1-NĐDH").length - 1, 1);
  assert.match(message, /4300\/2026\/VH1-NĐDH/);
  assert.match(message, /Tổng nhân sự đại tu: <b>100<\/b>/);
  assert.match(message, /Làm việc trong ngày: <b>30<\/b>/);
  assert.doesNotMatch(message, /Không làm|CHTT|Số lượng PCT/);
});
test("Tin dài chia đúng dòng, không cắt thẻ HTML hoặc entity khi nội dung nhiều dấu đặc biệt", () => {
  const message = buildOverhaulSessionMessage({ ...permit, content: '"'.repeat(600) }, { ...session,
    itemProgress: Array.from({ length: 20 }, (_, i) => ({ ...item, code: `1.${i}`, note: '"'.repeat(600) })),
  }, "COMBINED", [], at("09:00:00"));
  const chunks = splitOverhaulTelegramMessage(message);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 3800);
    assert.equal((chunk.match(/<b>/g) ?? []).length, (chunk.match(/<\/b>/g) ?? []).length);
    assert.doesNotMatch(chunk, /&[^;\s]*$/);
  }
});
