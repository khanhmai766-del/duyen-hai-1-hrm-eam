import assert from "node:assert/strict";
import { test } from "node:test";
import { read, utils, writeXLSX } from "xlsx";
import { buildPeriodStatistics, statisticsPeriod, statisticsSheetRows, STATISTICS_GROUPS } from "../../../modules/ctktkt/lib/period-statistics.ts";

test("kỳ thống kê theo lịch Việt Nam, có tuần giao năm và ngày chốt D-1", () => {
  const latest = "2026-11-20";
  const anchor = "2026-11-18";
  const ranges = {
    year: ["2026-01-01", latest],
    quarter: ["2026-10-01", latest],
    month: ["2026-11-01", latest],
    week: ["2026-11-16", latest],
    day: [anchor, anchor],
  };
  for (const [mode, [from, to]] of Object.entries(ranges)) {
    assert.deepEqual(statisticsPeriod(mode, anchor, latest), { from, to });
  }
  assert.deepEqual(statisticsPeriod("week", "2026-01-01", latest), { from: "2025-12-29", to: "2026-01-04" });
  assert.deepEqual(statisticsPeriod("month", "2024-02-20", latest), { from: "2024-02-01", to: "2024-02-29" });
});

const entries = (date, values) => Object.entries(values).map(([fieldCode, value]) =>
  ({ operatingDate: date, fieldCode, value: String(value) }));

test("giữ ranh giới kỳ, gia quyền KPI và phân biệt ngày trống với ngày bằng 0", () => {
  const request = { mode: "quarter", from: "2026-10-31", to: "2026-11-02" };
  const report = buildPeriodStatistics([
    ...entries("2026-10-30", { B: 999, H: 999, CU: 99 }),
    ...entries("2026-10-31", { B: 1, H: 0, C: 0.8, I: 0, AE_ADJ: 400, AF_ADJ: 0, AJ: 20000, AR: 100, CU: 24 }),
    ...entries("2026-11-01", { B: 3, H: 0, C: 2.7, I: 0, AE_ADJ: 1500, AF_ADJ: 0, AJ: 24000, AR: 120, CU: 0 }),
    ...entries("2026-11-03", { B: 999, H: 999, CU: 99 }),
  ], request);

  assert.deepEqual(report.rows.map(row => [row.label, row.from, row.to]), [
    ["Tháng 10/2026", "2026-10-31", "2026-10-31"],
    ["Tháng 11/2026", "2026-11-01", "2026-11-02"],
  ]);
  assert.equal(report.total.values.N, 4000);
  assert.equal(report.total.values.Q, 12.5);
  assert.ok(Math.abs(report.total.values.W - 44000 / 3.5) < 1e-9);
  assert.equal(report.total.values.CU, 24);
  assert.equal(report.total.values.AR, null);
  assert.equal(report.total.values.maintenanceRate, null);
  assert.equal(report.rows[0].values.maintenanceRate, 50);
  assert.equal(report.rows[1].values.CU, 0);
  assert.deepEqual(report.total.coverage, { production: 2, environment: 0, operation: 2 });

  const sheet = statisticsSheetRows(report, request, STATISTICS_GROUPS[0]);
  assert.deepEqual(sheet[1], ["Theo quý", "Từ ngày", "31/10/2026", "Đến ngày", "02/11/2026"]);
  assert.equal(sheet.at(-1)[7], 4000);
});

test("thiếu nhiệt trị ngày có phát thì suất hao tổng hợp để trống", () => {
  const report = buildPeriodStatistics([
    ...entries("2026-10-30", { B: 1, C: 0.9, H: 0, I: 0, AE_ADJ: 0.4, AF_ADJ: 0, AJ: 20000 }),
    ...entries("2026-10-31", { B: 1, C: 0.9, H: 0, I: 0, AE_ADJ: 0.4, AF_ADJ: 0 }),
  ], { mode: "month", from: "2026-10-30", to: "2026-10-31" });
  assert.equal(report.rows[1].values.W, null);
  assert.equal(report.total.values.W, null);
});

test("Excel ghi đúng kỳ đã chọn, đủ ba nhóm và giữ kiểu số", () => {
  const request = { mode: "year", from: "2026-01-01", to: "2026-10-31" };
  const report = buildPeriodStatistics(entries("2026-10-31", { B: 1.5, H: 0, C: 1.4, I: 0, CT: 0 }), request);
  const workbook = utils.book_new();
  for (const group of STATISTICS_GROUPS) {
    utils.book_append_sheet(workbook, utils.aoa_to_sheet(statisticsSheetRows(report, request, group)), group.label);
  }
  const saved = read(writeXLSX(workbook, { type: "buffer" }));
  assert.deepEqual(saved.SheetNames, STATISTICS_GROUPS.map(group => group.label));
  const production = saved.Sheets["Chỉ tiêu KTKT"];
  assert.equal(production.E2.v, "31/10/2026");
  assert.equal(production.H14.t, "n");
  assert.equal(production.H14.v, 1500);
  assert.equal(production.H4, undefined);
});
