import assert from "node:assert/strict";
import test from "node:test";
import type { OverhaulMilestone } from "../lib/overhaul-milestones";
import { actualFraction, campaignProgress, milestoneStatus, milestoneWeight, parseActualInput, plannedFraction, progressSCurve, type MilestoneProgressLog } from "../lib/overhaul-milestone-progress";

const base = { sourceKey: "x", note: null, sortOrder: 0, createdById: null, updatedById: null, createdAt: "", updatedAt: "" };
// Tháo tuabin và máy phát: 16/10 → 31/10 (16 ngày); Ngừng trở trục: mốc đơn 15/10.
const range: OverhaulMilestone = { ...base, id: "r", title: "Tháo tuabin và máy phát", startDate: "2026-10-16", endDate: "2026-10-31" };
const point: OverhaulMilestone = { ...base, id: "p", title: "Ngừng trở trục tuabin", startDate: "2026-10-15", endDate: null };

test("trọng số theo số ngày kế hoạch: khoảng ngày tính cả hai đầu, mốc đơn = 1", () => {
  assert.equal(milestoneWeight(range), 16);
  assert.equal(milestoneWeight(point), 1);
  assert.equal(milestoneWeight({ startDate: "2026-10-16", endDate: "2026-10-16" }), 1);
});

test("kế hoạch: khoảng ngày tăng đều theo ngày và chặn 0…1; mốc đơn 0/1", () => {
  assert.equal(plannedFraction(range, "2026-10-15"), 0);
  assert.equal(plannedFraction(range, "2026-10-16"), 1 / 16);
  assert.equal(plannedFraction(range, "2026-10-23"), 8 / 16);
  assert.equal(plannedFraction(range, "2026-11-20"), 1);
  assert.equal(plannedFraction(point, "2026-10-14"), 0);
  assert.equal(plannedFraction(point, "2026-10-15"), 1);
});

test("thực tế: có ngày hoàn thành = 100%; mốc đơn chỉ 0/1", () => {
  assert.equal(actualFraction({ ...range, actualPercent: 40 }), 0.4);
  assert.equal(actualFraction({ ...range, actualPercent: 40, actualEnd: "2026-10-30" }), 1);
  assert.equal(actualFraction({ ...point, actualPercent: 50 }), 0);
});

test("trạng thái: chậm / vượt / quá hạn / trễ bắt đầu / hoàn thành trễ", () => {
  assert.equal(milestoneStatus({ ...range, actualStart: "2026-10-16", actualPercent: 25 }, "2026-10-23").tone, "warn"); // KH 50%
  assert.match(milestoneStatus({ ...range, actualStart: "2026-10-16", actualPercent: 25 }, "2026-10-23").label, /chậm 25%/);
  assert.equal(milestoneStatus({ ...range, actualStart: "2026-10-16", actualPercent: 70 }, "2026-10-23").tone, "good");
  assert.match(milestoneStatus(range, "2026-11-02").label, /Quá hạn 2 ngày/);
  assert.match(milestoneStatus(range, "2026-10-18").label, /Trễ bắt đầu 2 ngày/);
  assert.equal(milestoneStatus(range, "2026-10-16").tone, "idle");
  assert.equal(milestoneStatus(range, "2026-10-10").label, "Chưa tới hạn");
  assert.match(milestoneStatus({ ...point, actualEnd: "2026-10-17" }, "2026-10-20").label, /Hoàn thành trễ 2 ngày/);
  assert.equal(milestoneStatus({ ...point, actualEnd: "2026-10-15" }, "2026-10-20").label, "Hoàn thành đúng hạn");
});

test("tổng đợt có trọng số theo số ngày", () => {
  // 23/10: KH = (16×8/16 + 1×1) / 17 = 9/17; TT = (16×0,25 + 1×1) / 17 = 5/17.
  const result = campaignProgress([{ ...range, actualStart: "2026-10-16", actualPercent: 25 }, { ...point, actualEnd: "2026-10-15" }], "2026-10-23");
  assert.equal(result.planned, Math.round(9 / 17 * 1000) / 10);
  assert.equal(result.actual, Math.round(5 / 17 * 1000) / 10);
  assert.equal(result.behind, 1);
  assert.equal(result.overdue, 0);
});

test("đường S thực tế: lần cập nhật gần nhất ≤ ngày; xong tính từ ngày hoàn thành thực tế", () => {
  const log = (reportDate: string, percent: number, actualEnd: string | null = null): MilestoneProgressLog =>
    ({ id: reportDate, milestoneId: "r", reportDate, actualStart: "2026-10-16", actualEnd, percent, note: null, createdByName: null, createdAt: `${reportDate}T10:00:00Z` });
  const done = { ...range, actualEnd: "2026-10-28", actualPercent: 100 };
  const curve = progressSCurve([done], [log("2026-10-20", 30), log("2026-10-25", 60), log("2026-10-30", 100, "2026-10-28")], "2026-10-30");
  const at = (date: string) => curve.find(p => p.date === date)!;
  assert.equal(at("2026-10-19").actual, 0);
  assert.equal(at("2026-10-22").actual, 30);
  assert.equal(at("2026-10-26").actual, 60);
  assert.equal(at("2026-10-28").actual, 100); // nhập bù ngày 30 nhưng xong từ 28
  assert.equal(at("2026-10-31").actual, null); // sau hôm nay
  assert.equal(at("2026-10-31").planned, 100);
});

test("kiểm tra dữ liệu nhập", () => {
  const today = "2026-10-20";
  assert.deepEqual(parseActualInput({ actualStart: "2026-10-16", percent: 40 }, range, today),
    { actualStart: "2026-10-16", actualEnd: null, percent: 40, note: null, reportDate: today });
  assert.equal(parseActualInput({ actualEnd: "2026-10-19", percent: 10 }, range, today).percent, 100);
  assert.throws(() => parseActualInput({ actualStart: "2026-10-21", percent: 10 }, range, today), /không được sau hôm nay/);
  assert.throws(() => parseActualInput({ percent: 50 }, point, today), /Mốc đơn/);
  assert.throws(() => parseActualInput({ percent: 100 }, range, today), /ngày hoàn thành/);
  assert.throws(() => parseActualInput({ actualStart: "2026-10-18", actualEnd: "2026-10-17" }, range, today), /từ ngày bắt đầu/);
  assert.equal(parseActualInput({ actualEnd: "2026-10-15" }, point, today).actualStart, "2026-10-15");
});
