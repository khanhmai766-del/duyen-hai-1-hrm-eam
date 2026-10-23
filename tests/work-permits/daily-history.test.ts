import assert from "node:assert/strict";
import test from "node:test";
import { dailyWorkingPeople, type DailyWorkingSession } from "../../lib/work-permit-daily-people";
import { countWorkersByCompany, dailyWorkers, DAILY_HISTORY_MAX_DAYS, permitWorkingDayRange, shiftWorkingDay, workingDayLabel } from "../../lib/work-permit-daily-history";

const at = (day: string, time: string) => new Date(`${day}T${time}+07:00`);
const now = at("2026-10-14", "12:00:00");
type Session = DailyWorkingSession & { permit: { id: string } };
const session = (permit: string, day: string, changes: Partial<Session> = {}): Session => ({
  commanderId: "chtt", commanderCode: "CH01", commanderName: "Chỉ huy", company: "EPS",
  openedAt: at(day, "08:00:00"), endedAt: at(day, "17:00:00"), members: [], permit: { id: permit }, ...changes,
});
const worker = (personId: string, company: string, day: string, from = "08:00:00", to: string | null = "16:00:00") => ({
  personId, code: personId.toUpperCase(), name: `Người ${personId}`, company,
  attendance: [{ in: at(day, from).toISOString(), out: to ? at(day, to).toISOString() : null }],
});

test("Khoảng ngày gồm cả hai đầu, qua tháng; sai chiều hoặc quá dài thì báo lỗi", () => {
  assert.deepEqual(permitWorkingDayRange("2026-09-29", "2026-10-02"), ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
  assert.deepEqual(permitWorkingDayRange("2026-10-05", "2026-10-05"), ["2026-10-05"]);
  assert.equal(shiftWorkingDay("2026-01-01", -1), "2025-12-31");
  assert.throws(() => permitWorkingDayRange("2026-10-05", "2026-10-04"), /trước ngày kết thúc/);
  assert.throws(() => permitWorkingDayRange("2026-01-01", shiftWorkingDay("2026-01-01", DAILY_HISTORY_MAX_DAYS)), /tối đa/);
  assert.equal(permitWorkingDayRange("2026-01-01", shiftWorkingDay("2026-01-01", DAILY_HISTORY_MAX_DAYS - 1)).length, DAILY_HISTORY_MAX_DAYS);
  assert.throws(() => permitWorkingDayRange("2026-02-30", "2026-03-01"));
});

test("Nhãn ngày: thứ theo lịch, không lệch vì múi giờ", () => {
  assert.deepEqual(workingDayLabel("2026-10-23"), { short: "23/10", full: "23/10/2026", weekday: "T6", weekend: false });
  assert.equal(workingDayLabel("2026-10-25").weekday, "CN");
  assert.equal(workingDayLabel("2026-10-24").weekend, true);
});

test("Số mỗi ngày khớp dailyWorkingPeople; người làm hai PCT được tính một lần, ghi đủ PCT và vai trò CHTT", () => {
  const day = "2026-10-13";
  const sessions = [
    session("pct-1", day, { members: [worker("a", "EPS", day), worker("b", "EPS", day)] }),
    // CHTT của phiếu 1 làm nhân viên ở phiếu 2; "a" cũng làm tiếp ở phiếu 2.
    session("pct-2", day, { commanderId: "chtt-2", commanderCode: "CH02", commanderName: "Chỉ huy 2", company: "S3A",
      openedAt: at(day, "13:00:00"), members: [{ personId: "chtt", code: "CH01", name: "Chỉ huy", company: "EPS" }, worker("a", "EPS", day, "13:00:00")] }),
  ];
  const workers = dailyWorkers(sessions, day, now);
  assert.equal(workers.length, dailyWorkingPeople(sessions, day, now).length);
  assert.deepEqual(workers.map(person => person.personId), ["chtt", "a", "b", "chtt-2"]);
  const byId = new Map(workers.map(person => [person.personId, person]));
  assert.equal(byId.get("chtt")?.commander, true);
  assert.deepEqual(byId.get("chtt")?.permitIds, ["pct-1", "pct-2"]);
  assert.deepEqual(byId.get("a")?.permitIds, ["pct-1", "pct-2"]);
  assert.equal(byId.get("a")?.commander, false);
  assert.deepEqual(countWorkersByCompany(workers, person => person.company), { EPS: 3, S3A: 1 });
  // Đơn vị theo hồ sơ hiện tại (người "b" đã chuyển sang S3A).
  assert.deepEqual(countWorkersByCompany(workers, person => person.personId === "b" ? "S3A" : person.company), { EPS: 2, S3A: 2 });
});

test("Một lượt làm việc qua 0h tính cho cả hai ngày; ngày không chạm thì không tính", () => {
  const overnight = session("pct-3", "2026-10-12", { openedAt: at("2026-10-12", "20:00:00"), endedAt: at("2026-10-13", "04:00:00"),
    members: [{ personId: "night", code: "N1", name: "Ca đêm", company: "EPS", attendance: [{ in: at("2026-10-12", "20:00:00").toISOString(), out: at("2026-10-13", "03:00:00").toISOString() }] }] });
  const counts = ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"].map(day => dailyWorkers([overnight], day, now).length);
  assert.deepEqual(counts, [0, 2, 2, 0]);
});
