import assert from "node:assert/strict";
import test from "node:test";
import { dailyWorkingPeople, permitWorkingDayBounds, type DailyWorkingSession } from "../../lib/work-permit-daily-people";

const day = "2026-10-12";
const at = (time: string) => new Date(`2026-10-12T${time}+07:00`);
const now = at("23:00:00");
const member = { personId: "worker", code: "001", name: "Nhân viên", company: "Nhà thầu" };
const session = (changes: Partial<DailyWorkingSession> = {}): DailyWorkingSession => ({
  commanderId: "commander", commanderCode: "CH01", commanderName: "Chỉ huy", company: "Nhà thầu",
  openedAt: at("08:00:00"), endedAt: at("17:00:00"), members: [], ...changes,
});

test("Gộp một người qua nhiều PCT, đổi thẻ và nhiều lượt vào/ra; không tính người chưa vào", () => {
  const first = session({ members: [{ ...member, attendance: [
    { in: at("08:00:00").toISOString(), out: at("10:00:00").toISOString() },
    { in: at("13:00:00").toISOString(), out: at("16:00:00").toISOString() },
  ] }, { ...member, personId: "waiting", code: "002", attendance: [] }] });
  const second = session({ members: [{ ...member, code: "THẺ MỚI", attendance: [{ in: at("18:00:00").toISOString(), out: null }] }], openedAt: at("18:00:00"), endedAt: null });
  assert.deepEqual(dailyWorkingPeople([first, second], day, now).map(person => person.personId), ["commander", "worker"]);
});

test("Lần làm việc qua 0h: chỉ tính lượt nhân viên giao với ngày, kể cả đã ra", () => {
  const previous = new Date("2026-10-11T22:00:00+07:00");
  const result = dailyWorkingPeople([session({ openedAt: previous, endedAt: at("03:00:00"), members: [
    { ...member, attendance: [{ in: previous.toISOString(), out: at("01:00:00").toISOString() }] },
    { ...member, personId: "left-yesterday", code: "003", attendance: [{ in: previous.toISOString(), out: new Date("2026-10-11T23:00:00+07:00").toISOString() }] },
  ] })], day, now);
  assert.equal(result.length, 2);
});

test("Khoảng ngày nửa mở: ra đúng 0h hôm nay và vào đúng 0h hôm sau không thuộc hôm nay", () => {
  const { start, end } = permitWorkingDayBounds(day);
  assert.equal(start.toISOString(), "2026-10-11T17:00:00.000Z");
  const result = dailyWorkingPeople([
    session({ openedAt: new Date(start.getTime() - 3600_000), endedAt: start }),
    session({ openedAt: end, endedAt: null }),
  ], day, end);
  assert.equal(result.length, 0);
});

test("Dữ liệu cũ thiếu lượt vào/ra vẫn tính theo lần làm việc; bỏ JSON lỗi", () => {
  assert.equal(dailyWorkingPeople([session({ members: [member, null, {}, { ...member, attendance: [{ in: "sai", out: null }] }] })], day, now).length, 2);
});

test("Báo cáo lúc 0h lấy ngày vừa kết thúc, không tính lần làm việc trong tương lai", () => {
  const midnight = new Date("2026-10-13T00:00:00+07:00");
  assert.equal(dailyWorkingPeople([session({ endedAt: null, members: [member] })], day, midnight).length, 2);
  assert.equal(dailyWorkingPeople([session({ openedAt: at("22:00:00"), endedAt: null })], day, at("21:00:00")).length, 0);
  assert.throws(() => permitWorkingDayBounds("2026-02-30"), RangeError);
  assert.throws(() => permitWorkingDayBounds("12/10/2026"), RangeError);
});
