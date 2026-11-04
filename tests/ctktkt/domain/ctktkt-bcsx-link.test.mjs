import assert from "node:assert/strict";
import { test } from "node:test";
import { CTKTKT_BCSX_LINKS, deriveCtktktCellsFromBcsx } from "../../../modules/ctktkt/lib/ctktkt-bcsx-link.ts";

const times = ["06:00", "10:00", "14:00", "18:00", "22:00", "23:59"];

function completeReadings() {
  const readings = [];
  for (const [timeIndex, timeSlot] of times.entries()) {
    for (const [unitIndex, unit] of ["S1", "S2"].entries()) {
      readings.push({ unit, timeSlot, metric: "P", value: String(400 + unitIndex * 10 + timeIndex) });
      readings.push({ unit, timeSlot, metric: "Q", value: String(10 + unitIndex * 10 + timeIndex) });
      readings.push({ unit, timeSlot, metric: "D", value: String(360 + unitIndex * 10 + timeIndex) });
      readings.push({ unit, timeSlot, metric: "E", value: String(230 + timeIndex) });
    }
  }
  return readings;
}

test("BCSX section 1 maps 42 cells to the six CTKTKT sampling times", () => {
  const result = deriveCtktktCellsFromBcsx(completeReadings());
  assert.equal(CTKTKT_BCSX_LINKS.length, 42);
  assert.equal(Object.keys(result.entries).length, 42);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.entries.M3, "400");
  assert.equal(result.entries.R4, "15");
  assert.equal(result.entries.M7, "360");
  assert.equal(result.entries.R8, "375");
  assert.equal(result.entries.Q20, "234");
});

test("Utc 220 kV always uses S1 and ignores S2", () => {
  const readings = completeReadings();
  readings.find(reading => reading.unit === "S2" && reading.timeSlot === "10:00" && reading.metric === "E").value = "999";
  const result = deriveCtktktCellsFromBcsx(readings);
  assert.equal(result.entries.N20, "231");
  assert.deepEqual(result.warnings, []);

  const withoutS1 = readings.filter(reading => !(reading.unit === "S1" && reading.timeSlot === "10:00" && reading.metric === "E"));
  assert.equal(deriveCtktktCellsFromBcsx(withoutS1).entries.N20, undefined);
});

test("PMIS 02-PD QLKT extractor extracts row 'Duyên Hải 1' and maps to C181..T181 and J157..K158", async () => {
  await import("../../../public/ctktkt/qlkt-sync-extension/content.js");
  assert.ok(globalThis.Qlkt02PdExtractor, "Qlkt02PdExtractor must be defined on globalThis");

  // Mock production table
  const productionTables = [
    [
      ["Tổ máy", "SL phát", "SL mua", "SL điểm bán", "Tổng tự dùng"],
      ["DH1_MF1", "10 472,68", "0", "9 631,526", "841,154"],
      ["DH1_MF2", "10 474,00", "0", "9 593,341", "880,659"],
    ]
  ];

  // Mock 02-PĐ table matching media_1789830004294.png
  const pmis02PdTables = [
    [
      ["Tên đơn vị", "Công suất đặt", "Điện năng tác dụng", "Điện năng phản kháng", "Điện năng giao", "Điện năng nhận", "Điện năng nhận chạy bù", "MBA kích từ", "MBA nâng", "Điện năng tự dùng", "k tự dùng", "Nhiên liệu sử dụng", "Suất hao nhiên liệu thô", "Suất hao nhiên liệu tinh", "Suất hao nhiệt thô", "Suất hao nhiệt tinh", "Hệ số sử dụng", "Hệ số đáp ứng", "Độ phát thải"],
      ["Duyên Hải 1", "1 245", "22,2914", "0,0000", "20,4947", "0,0000", "0,0000", "0,0000", "0,0000", "1,7967", "8,0601", "0,0109", "491,1313", "534,1871", "9 693,0945", "10 542,8561", "0,7460", "100,0000", "Đạt"],
      ["Duyên Hải 3", "1 245", "10,9325", "0,0000", "10,1250", "0,0000", "0,0000", "0,0000", "0,0000", "0,8017", "7,3335", "0,0052", "472,6632", "510,3614", "10 003,3166", "10 801,1506", "0,3659", "92,4000", "Đạt"],
    ]
  ];

  const payload = globalThis.Qlkt02PdExtractor.extractPmis02PdPayload(
    pmis02PdTables,
    "2026-09-18",
    productionTables,
  );

  assert.equal(payload.kind, "pmis_02pd");
  assert.equal(payload.operatingDate, "2026-09-18");

  const entryMap = new Map(payload.entries.map(e => [e.cell, e.value]));

  // Verify production extraction
  assert.equal(entryMap.get("J157"), "10472.68");
  assert.equal(entryMap.get("K157"), "9631.526");
  assert.equal(entryMap.get("J158"), "10474.00");
  assert.equal(entryMap.get("K158"), "9593.341");

  // Verify 02-PĐ row "Duyên Hải 1" extraction
  assert.equal(entryMap.get("C181"), "1245");
  assert.equal(entryMap.get("D181"), "22.2914");
  assert.equal(entryMap.get("E181"), "0.0000");
  assert.equal(entryMap.get("F181"), "20.4947");
  assert.equal(entryMap.get("G181"), "0.0000");
  assert.equal(entryMap.get("H181"), "0.0000");
  assert.equal(entryMap.get("I181"), "0.0000");
  assert.equal(entryMap.get("J181"), "0.0000");
  assert.equal(entryMap.get("K181"), "1.7967");
  assert.equal(entryMap.get("L181"), "8.0601");
  assert.equal(entryMap.get("M181"), "0.0109");
  assert.equal(entryMap.get("N181"), "491.1313");
  assert.equal(entryMap.get("O181"), "534.1871");
  assert.equal(entryMap.get("P181"), "9693.0945");
  assert.equal(entryMap.get("Q181"), "10542.8561");
  assert.equal(entryMap.get("R181"), "0.7460");
  assert.equal(entryMap.get("S181"), "100.0000");
  assert.equal(entryMap.get("T181"), "Đạt");
});
