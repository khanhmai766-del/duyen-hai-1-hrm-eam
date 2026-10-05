import assert from "node:assert/strict";
import test from "node:test";
import { buildMilestoneSchedule, milestoneEvents, milestonePhase, parseMilestoneInput, vietnamDate, type OverhaulMilestone } from "../lib/overhaul-milestones";
import { S2_MILESTONES_SOURCE } from "../lib/overhaul-milestones-source";

const items: OverhaulMilestone[] = S2_MILESTONES_SOURCE.map((row) => ({
  ...row, id: row.sourceKey, createdById: null, updatedById: null,
  createdAt: "2026-10-03T00:00:00Z", updatedAt: "2026-10-03T00:00:00Z",
}));

test("PL2 có đủ 20 mốc đơn, 14 khoảng ngày và 48 lần nhắc", () => {
  assert.equal(items.length, 34);
  assert.equal(new Set(items.map((item) => item.sourceKey)).size, 34);
  assert.equal(items.filter((item) => item.endDate).length, 14);
  assert.equal(milestoneEvents(items, "2026-10-03").length, 48);
  assert.equal(items.find((item) => item.sourceKey.endsWith(":thao-tuabin-may-phat"))?.endDate, "2026-10-31");
  assert.equal(items.find((item) => item.sourceKey.endsWith(":co2-h2"))?.startDate, "2026-11-27");
});

for (const [day, count] of [["2026-10-06", 2], ["2026-11-21", 3], ["2026-12-01", 2], ["2026-12-03", 2], ["2026-12-04", 0]] as const) {
  test(`Nhắc đúng ngày ${day}: ${count} sự kiện`, () => {
    const schedule = buildMilestoneSchedule(items, new Date(`${day}T08:00:00+07:00`));
    assert.equal(schedule.today, day);
    assert.equal(schedule.todayEvents.length, count);
    assert.ok(schedule.todayEvents.every((event) => event.date === day && event.daysLeft === 0));
    assert.ok(schedule.upcoming.every((event) => event.date > day && event.daysLeft > 0));
    assert.ok(schedule.upcoming.length <= 3);
  });
}

test("Chuyển ngày nhà máy lúc 17:00 UTC, độc lập timezone host", () => {
  assert.equal(vietnamDate(new Date("2026-10-05T16:59:59.999Z")), "2026-10-05");
  assert.equal(vietnamDate(new Date("2026-10-05T17:00:00.000Z")), "2026-10-06");
  assert.equal(buildMilestoneSchedule(items, new Date("2026-10-05T16:59:59.999Z")).todayEvents.length, 0);
  assert.equal(buildMilestoneSchedule(items, new Date("2026-10-05T17:00:00.000Z")).todayEvents.length, 2);
});

test("Khoảng ngày chỉ nhắc đầu/cuối; một ngày không nhắc hai lần; không suy ra hoàn thành", () => {
  const range = items.find((item) => item.sourceKey.endsWith(":lam-mat-lo"))!;
  assert.equal(buildMilestoneSchedule([range], new Date("2026-10-07T01:00:00Z")).todayEvents.length, 0);
  assert.equal(milestonePhase(range, "2026-10-07"), "Trong khoảng kế hoạch");
  assert.equal(milestonePhase(range, "2026-10-11"), "Đã qua ngày kế hoạch");
  assert.equal(milestoneEvents([{ ...range, endDate: range.startDate }], range.startDate).length, 1);
});

test("Sửa/xoá cập nhật lịch và nhắc; sửa ngày không đổi mã nguồn", () => {
  const point = items[0];
  const edited = { ...point, startDate: "2026-10-07" };
  assert.equal(edited.sourceKey, point.sourceKey);
  assert.equal(buildMilestoneSchedule([edited], new Date("2026-10-06T01:00:00Z")).todayEvents.length, 0);
  assert.equal(buildMilestoneSchedule([edited], new Date("2026-10-07T01:00:00Z")).todayEvents.length, 1);
  assert.equal(buildMilestoneSchedule([], new Date("2026-10-07T01:00:00Z")).todayEvents.length, 0);
});

test("Chặn ngày sai, khoảng ngược, tên/ghi chú quá dài", () => {
  const valid = { title: " Thử nghiệm ", startDate: "2026-12-01", endDate: "2026-12-03", note: " " };
  assert.equal(parseMilestoneInput(valid).title, "Thử nghiệm");
  assert.equal(parseMilestoneInput(valid).note, null);
  for (const patch of [{ startDate: "2026-02-30" }, { startDate: "2026-1-01" }, { endDate: "2026-11-30" }, { title: "" }, { title: "x".repeat(501) }, { note: "x".repeat(2001) }, { note: {} }]) {
    assert.throws(() => parseMilestoneInput({ ...valid, ...patch }));
  }
});
