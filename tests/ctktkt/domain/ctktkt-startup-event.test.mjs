import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { applyCtktktStartupEventMetadata } from "../../../modules/ctktkt/lib/ctktkt-startup-event.ts";
import { CTKTKT_TEMPLATE_BASE64 } from "../../../modules/ctktkt/lib/ctktkt-template.generated.ts";

function exportEvent(entries) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("03");
  applyCtktktStartupEventMetadata(sheet, entries);
  return sheet;
}

test("startup export shows oil start, grid synchronization, oil cut and two phase totals", () => {
  const sheet = exportEvent({
    "KTKT:STARTUP_UNIT": "S1",
    "KTKT:STARTUP_EVENT": "startup",
    "KTKT:STARTUP_OIL_START_TIME": "01:15",
    "KTKT:STARTUP_GRID_SYNC_TIME": "04:30",
    "KTKT:STARTUP_MIN_LOAD_TIME": "05:10",
    "KTKT:STARTUP_MIN_LOAD_MW": "180",
    "KTKT:C87": "100", "KTKT:C88": "20",
    "KTKT:E87": "130", "KTKT:E88": "25",
    "KTKT:G87": "150", "KTKT:G88": "27",
  });

  assert.match(String(sheet.getCell("B86").value), /S1 - KHỞI ĐỘNG/);
  assert.match(String(sheet.getCell("C86").value), /Bắt đầu đốt dầu.*01:15/s);
  assert.match(String(sheet.getCell("E86").value), /Hòa lưới.*04:30/s);
  assert.match(String(sheet.getCell("G86").value), /Cắt dầu kết thúc khởi động - tải min 180 MW.*05:10/s);
  assert.equal(sheet.getCell("E89").value, 25);
  assert.equal(sheet.getCell("G89").value, 18);
  assert.equal(sheet.getCell("H89").value, 43);
  assert.equal(sheet.getCell("D87").value, null);
  assert.equal(sheet.getCell("F87").value, null);
  assert.match(String(sheet.getCell("B90").value), /tổng: 43 tấn/);
});

test("shutdown export keeps only oil-start and grid-disconnect meter columns", () => {
  const sheet = exportEvent({
    "KTKT:STARTUP_UNIT": "S2",
    "KTKT:STARTUP_EVENT": "shutdown",
    "KTKT:STARTUP_OIL_START_TIME": "20:00",
    "KTKT:STARTUP_GRID_SYNC_TIME": "21:30",
    "KTKT:C87": "100", "KTKT:C88": "20",
    "KTKT:F87": "125", "KTKT:F88": "24",
  });

  assert.match(String(sheet.getCell("C86").value), /Bắt đầu đốt dầu giảm tải.*20:00/s);
  assert.match(String(sheet.getCell("F86").value), /Tách lưới.*21:30/s);
  assert.equal(sheet.getCell("F89").value, 21);
  assert.equal(sheet.getCell("H89").value, 21);
  assert.equal(sheet.getCell("D87").value, null);
  assert.equal(sheet.getCell("E87").value, null);
  assert.equal(sheet.getCell("G87").value, null);
});

test("incident export keeps only oil-start and oil-cut meter columns", () => {
  const sheet = exportEvent({
    "KTKT:STARTUP_UNIT": "S1",
    "KTKT:STARTUP_EVENT": "incident_oil",
    "KTKT:STARTUP_OIL_START_TIME": "10:05",
    "KTKT:STARTUP_MIN_LOAD_TIME": "10:45",
    "KTKT:C87": "100", "KTKT:C88": "20",
    "KTKT:D87": "140", "KTKT:D88": "26",
  });

  assert.match(String(sheet.getCell("C86").value), /Bắt đầu đốt dầu.*10:05/s);
  assert.match(String(sheet.getCell("D86").value), /Cắt dầu.*10:45/s);
  assert.equal(sheet.getCell("D89").value, 34);
  assert.equal(sheet.getCell("H89").value, 34);
  assert.equal(sheet.getCell("E87").value, null);
  assert.equal(sheet.getCell("F87").value, null);
  assert.equal(sheet.getCell("G87").value, null);
});

test("startup metadata applies cleanly to the real day-03 workbook template", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(CTKTKT_TEMPLATE_BASE64, "base64"));
  const sheet = workbook.getWorksheet("03");
  assert.ok(sheet);
  applyCtktktStartupEventMetadata(sheet, {
    "KTKT:STARTUP_UNIT": "S1",
    "KTKT:STARTUP_EVENT": "startup",
    "KTKT:STARTUP_OIL_START_TIME": "01:15",
    "KTKT:STARTUP_GRID_SYNC_TIME": "04:30",
    "KTKT:STARTUP_MIN_LOAD_TIME": "05:10",
    "KTKT:C87": "100", "KTKT:C88": "20",
    "KTKT:E87": "130", "KTKT:E88": "25",
    "KTKT:G87": "150", "KTKT:G88": "27",
  });
  assert.match(String(sheet.getCell("G86").value), /Cắt dầu kết thúc khởi động/);
  assert.equal(sheet.getCell("H89").value, 43);
});
