import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { calculateCtktktMeterSummary } from "../../../modules/ctktkt/lib/ctktkt-report.ts";
import { applyElectricMeterResetExport, electricMeterResetAdjustment } from "../../../modules/ctktkt/lib/ctktkt-electric-meter-reset.ts";
import { REPORT_WRITABLE_CELLS } from "../../../modules/ctktkt/lib/report-writable-fields.ts";
import { canEditCtktktField } from "../../../modules/ctktkt/lib/ctktkt-permissions.ts";
import { shouldShowCtktktMissingField } from "../../../modules/ctktkt/lib/ctktkt-missing-fields.ts";

// Số liệu thật ngày 03/11/2026: công tơ MBT T1 reset lúc 22h, công tơ MBT T2 về 0 khi S2 ngừng.
// File chuẩn: E21 = D21-C21+6935855.62+280.956 = 13561.476; H21 = G21-F21+6554821.3 = 0.
const previous = { AB8: "32237507", AB9: "6928195.5", AB10: "2166783", AB11: "366456.7", AL8: "31422954", AL9: "6554821.3", AL10: "2121735.4", AL11: "327072.9" };
const current = {
  AB8: "32252139", AB9: "5620.4", AB10: "2167689.2", AB11: "366600.9",
  AL8: "31422954", AL9: "0", AL10: "2121735.4", AL11: "327072.9",
  ELEC_RESET_S1_9: "6936136.576", ELEC_RESET_S2_9: "6554821.3",
};

test("lượng điện qua công tơ cộng hiệu chỉnh khi reset, khớp file chuẩn 03/11", () => {
  const meters = calculateCtktktMeterSummary(current, previous);
  assert.equal(meters.s1.grossMwh, 14632);
  assert.ok(Math.abs(meters.s1.netMwh - 13561.476) < 1e-6);
  assert.equal(meters.s2.netMwh, 0);
  assert.ok(Math.abs(meters.s1.auxiliaryPercent - 7.316320393654426) < 1e-9);
  const without = calculateCtktktMeterSummary({ ...current, ELEC_RESET_S1_9: "", ELEC_RESET_S2_9: "" }, previous);
  assert.ok(without.s1.netMwh < 0, "không hiệu chỉnh thì công tơ reset cho số âm");
});

test("ô trống hoặc dấu phẩy thập phân", () => {
  assert.equal(electricMeterResetAdjustment({}, "S1", 8), 0);
  assert.equal(electricMeterResetAdjustment({ ELEC_RESET_S2_10: "12,5" }, "S2", 10), 12.5);
});

test("file Excel cộng hiệu chỉnh vào công thức E/H 20–23 và ghi lý do", () => {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("03");
  sheet.getCell("E21").value = { formula: "D21-C21" }; sheet.getCell("E20").value = { formula: "D20-C20" };
  applyElectricMeterResetExport(sheet, { "KTKT:ELEC_RESET_S1_9": "6936136.576", "KTKT:ELEC_RESET_S2_9": "6554821.3", "KTKT:ELEC_RESET_NOTE_S1": "MBT T1 reset 22h" });
  assert.equal(sheet.getCell("E21").formula, "D21-C21+(6936136.576)");
  assert.equal(sheet.getCell("H21").formula, "G21-F21+(6554821.3)");
  assert.equal(sheet.getCell("E20").formula, "D20-C20");
  assert.match(sheet.getCell("E21").note, /MBT T1 reset 22h/);
});

test("ô hiệu chỉnh được lưu qua API, thuộc nhóm công tơ điện và không bị báo thiếu", () => {
  for (const cell of ["ELEC_RESET_S1_8", "ELEC_RESET_S1_11", "ELEC_RESET_S2_9", "ELEC_RESET_NOTE_S1", "ELEC_RESET_NOTE_S2"]) {
    assert.ok(REPORT_WRITABLE_CELLS.has(cell), cell);
    assert.equal(shouldShowCtktktMissingField(cell, "2026-11-03", {}), false);
  }
  assert.equal(canEditCtktktField({ role: "admin" }, "ELEC_RESET_S1_9"), true);
});
