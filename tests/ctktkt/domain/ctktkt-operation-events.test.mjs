import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { CTKTKT_TEMPLATE_BASE64 } from "../../../modules/ctktkt/lib/ctktkt-template.generated.ts";
import {
  applyCtktktOperationEventLayout,
  applyCtktktOperationEvents,
  calculateCtktktOperationEventOil,
  createCtktktOperationEvent,
  normalizeCtktktOperationEvents,
} from "../../../modules/ctktkt/lib/ctktkt-operation-events.ts";

function point(event, key, values) {
  event.points[key] = { time: "", power: {}, oilFeed: "", oilReturn: "", ...values };
}

test("startup oil calculation follows the source phases and S2 /1000 conversion", () => {
  const s1 = createCtktktOperationEvent("S1", "startup");
  point(s1, "start", { oilFeed: "100", oilReturn: "10" });
  point(s1, "grid_sync", { oilFeed: "130", oilReturn: "25" });
  point(s1, "oil_cut", { oilFeed: "150", oilReturn: "27" });
  assert.deepEqual(calculateCtktktOperationEventOil(s1), { phases: [15, 18], total: 33 });

  const s2 = createCtktktOperationEvent("S2", "startup");
  point(s2, "start", { oilFeed: "100000", oilReturn: "10000" });
  point(s2, "grid_sync", { oilFeed: "130000", oilReturn: "25000" });
  point(s2, "oil_cut", { oilFeed: "150000", oilReturn: "27000" });
  assert.deepEqual(calculateCtktktOperationEventOil(s2), { phases: [15, 18], total: 33 });
});

test("shutdown and incident oil totals use the source meter differences", () => {
  const shutdown = createCtktktOperationEvent("S1", "shutdown");
  point(shutdown, "oil_burn_start", { oilFeed: "100", oilReturn: "20" });
  point(shutdown, "oil_cut", { oilFeed: "130", oilReturn: "25" });
  assert.deepEqual(calculateCtktktOperationEventOil(shutdown), { phases: [25], total: 25 });

  const incident = createCtktktOperationEvent("S2", "incident_oil");
  point(incident, "oil_burn_start", { oilFeed: "900", oilReturn: "80" });
  point(incident, "oil_cut", { oilFeed: "940", oilReturn: "90" });
  assert.deepEqual(calculateCtktktOperationEventOil(incident), { phases: [30], total: 30 });
});

test("event payload validation rejects duplicate slots, invalid dates and nonnumeric meters", () => {
  const first = createCtktktOperationEvent("S1", "startup");
  point(first, "start", { time: "2026-09-03T01:15", power: { "61": "123,5" } });
  const normalized = normalizeCtktktOperationEvents(JSON.stringify([first]));
  assert.match(normalized, /123\.5/);
  assert.throws(() => normalizeCtktktOperationEvents(JSON.stringify([first, first])), /một sự kiện cùng loại/iu);

  point(first, "start", { time: "2026-02-30T01:15" });
  assert.throws(() => normalizeCtktktOperationEvents(JSON.stringify([first])), /không tồn tại/iu);

  point(first, "start", { power: { "61": "abc" } });
  assert.throws(() => normalizeCtktktOperationEvents(JSON.stringify([first])), /phải là số/iu);
});

test("export maps event readings, times and formula results to the workbook coordinates", () => {
  const startup = createCtktktOperationEvent("S1", "startup");
  point(startup, "start", { time: "2026-09-03T01:15", power: { "61": "100" }, oilFeed: "100", oilReturn: "20" });
  point(startup, "grid_sync", { time: "2026-09-03T04:30", power: { "61": "125", "83": "5" }, oilFeed: "130", oilReturn: "25" });
  point(startup, "oil_cut", { time: "2026-09-03T05:10", oilFeed: "150", oilReturn: "27" });
  const shutdown = createCtktktOperationEvent("S2", "shutdown");
  point(shutdown, "boiler_stop", { time: "2026-09-03T20:00", power: { "61": "200" } });
  point(shutdown, "grid_disconnect", { time: "2026-09-03T21:00", power: { "61": "220" } });
  point(shutdown, "oil_burn_start", { time: "2026-09-03T19:30", oilFeed: "2000", oilReturn: "100" });
  point(shutdown, "oil_cut", { time: "2026-09-03T21:15", oilFeed: "2020", oilReturn: "110" });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("03");
  applyCtktktOperationEvents(sheet, JSON.stringify([startup, shutdown]));

  assert.equal(sheet.getCell("C61").value, 100);
  assert.equal(sheet.getCell("E61").value, 125);
  assert.equal(sheet.getCell("E83").value, 5);
  assert.equal(sheet.getCell("H61").value, 200);
  assert.equal(sheet.getCell("J61").value, 220);
  assert.equal(sheet.getCell("D90").value.formula, "(D88-C88)-(D89-C89)");
  assert.equal(sheet.getCell("D90").value.result, 25);
  assert.equal(sheet.getCell("E90").value.result, 18);
  assert.equal(sheet.getCell("F90").value.result, 43);
  assert.equal(sheet.getCell("C110").value.formula, "(D108-C108)-(D109-C109)");
  assert.equal(sheet.getCell("C110").value.result, 10);
  assert.equal(sheet.getCell("D86").numFmt, "hh:mm, dd/mm/yy");
  assert.equal(sheet.getCell("E59").value, "Hòa lưới S1\n03/09/2026 04:30");
});

test("new event layout replaces the old target block while retaining source formula locations", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(CTKTKT_TEMPLATE_BASE64, "base64"));
  const sheet = workbook.getWorksheet("03");
  assert.ok(sheet);
  applyCtktktOperationEventLayout(sheet);

  assert.equal(sheet.getCell("J59").value, "Tách lưới tổ máy S2");
  assert.equal(sheet.getCell("B60").value, "MBA T1/T2 (P giao)");
  assert.equal(sheet.getCell("B85").value, "Khởi động tổ máy S1");
  assert.equal(sheet.getCell("B98").value, "Ngừng tổ máy S1");
  assert.equal(sheet.getCell("F98").value, "Đốt dầu sự cố S1");
  assert.equal(sheet.getCell("D96").value.formula, "((D94-C94)-(D95-C95))/1000");
  assert.equal(sheet.getCell("C107").isMerged, false);
  assert.equal(sheet.getCell("C103").isMerged, true);
  for (const cell of ["F86", "G86", "H86", "F92", "G92", "H92", "C104", "D104"]) assert.equal(sheet.getCell(cell).value, null);
  assert.equal(sheet.getCell("F89").value, "Tổng dầu khởi động");
  assert.equal(sheet.getCell("F95").value, "Tổng dầu khởi động");
  for (const cell of ["B88", "E90", "D103", "H110"]) assert.equal(sheet.getCell(cell).border.bottom.style, "thin");
  assert.equal(sheet.getCell("D86").fill.fgColor.argb, "FF00B0F0");
  assert.equal(sheet.getCell("C87").fill.fgColor.argb, "FFFFFFFF");
});

test("all six unit-event slots populate their own oil tables and survive Excel serialization", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("03");
  applyCtktktOperationEventLayout(sheet);
  const slots = [
    ["S1", "startup", "C88", "E88", "F90", 1],
    ["S2", "startup", "C94", "E94", "F96", 1000],
    ["S1", "shutdown", "C101", "D101", "C103", 1],
    ["S2", "shutdown", "C108", "D108", "C110", 1],
    ["S1", "incident_oil", "G101", "H101", "G103", 1],
    ["S2", "incident_oil", "G108", "H108", "G110", 1],
  ];
  const events = slots.map(([unit, kind], index) => {
    const event = createCtktktOperationEvent(unit, kind);
    const start = kind === "startup" ? "start" : "oil_burn_start";
    point(event, start, {time:"2026-10-04T01:00",oilFeed:String(100+index*100),oilReturn:"10"});
    if(kind === "startup") point(event,"grid_sync",{time:"2026-10-04T02:00",oilFeed:String(120+index*100),oilReturn:"15"});
    point(event,"oil_cut",{time:"2026-10-04T03:00",oilFeed:String(140+index*100),oilReturn:"20"});
    return event;
  });
  applyCtktktOperationEvents(sheet, events);
  const reopened = new ExcelJS.Workbook();await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  const restored = reopened.getWorksheet("03");
  slots.forEach(([, , from, to, total, divisor],index)=>{
    assert.equal(restored.getCell(from).value,100+index*100);
    assert.equal(restored.getCell(to).value,140+index*100);
    assert.equal(restored.getCell(total).value.result,30/divisor);
    assert.ok(restored.getCell(total).formula);
  });
});
