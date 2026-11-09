import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { applyCtktktDailyCarryovers } from "../../../modules/ctktkt/lib/ctktkt-export-layout.ts";
import { calculatePmisAuxiliary } from "../../../modules/ctktkt/lib/ctktkt-pmis-auxiliary.ts";

// L157/L158 = "Tổng tự dùng PMIS" của S1/S2 trên trang ngày.
function exportFormulas(row, previousRow = { "KTKT:R49": "10151.7" }) {
  const sheet = new ExcelJS.Workbook().addWorksheet("07");
  applyCtktktDailyCarryovers(sheet, row, previousRow, "06");
  const f = cell => { const v = sheet.getCell(cell).value; return v && typeof v === "object" ? v.formula : v; };
  return { L157: f("L157"), L158: f("L158") };
}
const running = { "KTKT:J157": "14609.72", "KTKT:K157": "13570.648", B: "14.6" };

test("tổ có phát: (đầu cực − xuất tuyến) + điện nhận xuất tuyến", () => {
  assert.equal(exportFormulas({ ...running, H: "14.2", "KTKT:J158": "14200", "KTKT:K158": "13190" }).L157, "J157-K157");
  assert.equal(exportFormulas({ ...running, GRID_RECEIVE_S1: "12.3" }).L157, "J157-K157+12.3");
});

test("không phát, có nhận qua xuất tuyến của tổ (283 → S2): = điện nhận", () => {
  assert.equal(exportFormulas({ ...running, H: "0", GRID_RECEIVE_S2: "26.5", "KTKT:R49": "10180.5" }).L158, "J158-K158+26.5");
});

test("không phát, không nhận qua xuất tuyến của tổ → I24 (TD21), như 02–08/11/2026", () => {
  for (const received of [undefined, "0"]) {
    const row = { ...running, H: "0", "KTKT:R49": "10180.5" };
    if (received !== undefined) row.GRID_RECEIVE_S2 = received;
    assert.equal(exportFormulas(row).L158, "I24");
  }
});

test("S1 nhận qua 285, S2 qua TD21 khi cả hai không phát (01/11/2026)", () => {
  const out = exportFormulas({ B: "0", H: "0", GRID_RECEIVE_S1: "314.56028", "KTKT:R49": "10023" }, { "KTKT:R49": "10014.1" });
  assert.equal(out.L157, "J157-K157+314.56028");
  assert.equal(out.L158, "I24");
});

test("nhập tay (nhận xuất tuyến rồi cắt điện MBA…) luôn được ưu tiên", () => {
  const out = exportFormulas({ ...running, H: "0", GRID_RECEIVE_S2: "6.2", "KTKT:PMIS_AUX_MANUAL_S2": "21.75", "KTKT:R49": "10180.5" });
  assert.equal(out.L158, "21.75");
});

test("thiếu chỉ số TD21 hoặc cả hai tổ cùng qua TD21: giữ J − K để nhập tay", () => {
  assert.equal(exportFormulas({ ...running, H: "0" }).L158, "J158-K158");
  assert.equal(exportFormulas({ ...running, H: "0", "KTKT:R49": "10180.5" }, {}).L158, "J158-K158");
  const both = exportFormulas({ B: "0", H: "0", "KTKT:R49": "10180.5" });
  assert.equal(both.L157, "J157-K157");
  assert.equal(both.L158, "J158-K158");
});

test("giá trị trên màn hình khớp quy tắc", () => {
  const aux = calculatePmisAuxiliary({ values: { J157: "14609.72", K157: "13570.648", GRID_RECEIVE_S1: "0", J158: "0", K158: "0", R49: "10180.5" }, previousTd21: "10151.7" });
  assert.ok(Math.abs(aux.S1.value - 1039.072) < 1e-9);
  assert.equal(aux.S2.source, "td21");
  assert.ok(Math.abs(aux.S2.value - 28.8) < 1e-9);
  const withReceive = calculatePmisAuxiliary({ values: { J157: "100", K157: "90", GRID_RECEIVE_S1: "5" } });
  assert.equal(withReceive.S1.value, 15);
});
