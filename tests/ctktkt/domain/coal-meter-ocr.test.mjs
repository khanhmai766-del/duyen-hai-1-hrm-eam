import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coalMeterCell,
  compareCoalMeterOrder,
  matchCoalMeter,
  parseDigitsLine,
  parseMeterLabel,
  parseOverlayTime,
  parseTotalValue,
  previousCoalReading,
  readExifTime,
  reviewCoalReading,
  slotForPhotoTime,
  truncateTwoDecimals,
} from "../../../modules/ctktkt/lib/coal-meter-ocr.ts";

test("photos follow table meter order and shift order, with unidentified images last and ties stable", () => {
  const input = [
    {id:'f2',key:'S1-F2',slot:'08'}, {id:'unknown',key:null,slot:'08'},
    {id:'a2',key:'S1-A2',slot:'08'}, {id:'a1-24',key:'S1-A1',slot:'24'},
    {id:'s2',key:'S2-A1',slot:'08'}, {id:'a1-16',key:'S1-A1',slot:'16'},
    {id:'a1-08',key:'S1-A1',slot:'08'}, {id:'duplicate',key:'S1-A1',slot:'08'},
    {id:'missing-shift',key:'S1-A1',slot:''},
  ];
  assert.deepEqual([...input].sort(compareCoalMeterOrder).map(row=>row.id),
    ['a1-08','duplicate','a1-16','a1-24','missing-shift','a2','f2','s2','unknown']);
  assert.equal(input[0].id,'f2','sorting a display copy must not change upload order');
});

test("feeder label, display total and photo stamp from the 1E2 sample photo", () => {
  const ocr = "25 Sep 2026 at 15:58:46\nVinh Long\n1E2\nTotal: 75859.247 MTons\n0.00 MTons/hr\nMODE REMOTE OFF LOCAL";
  assert.equal(parseMeterLabel(ocr), "S1-E2");
  assert.equal(parseTotalValue(ocr), 75859.247);
  assert.deepEqual(parseOverlayTime(ocr), { date: "2026-09-25", hour: 15, minute: 58 });
  assert.equal(truncateTwoDecimals(75859.247), 75859.24);
  assert.equal(parseMeterLabel("2 A 1"), "S2-A1");
  assert.equal(parseMeterLabel("lEZ"), "S1-E2");
  assert.equal(parseDigitsLine(" 75859.247 "), 75859.247);
  assert.equal(parseTotalValue("TotaI: 9O681.O1 MTons"), 90681.01);
});

test("reading slots follow the 08h / 16h / 24h rounds, after midnight counts for the previous day", () => {
  assert.deepEqual(slotForPhotoTime({ date: "2026-09-25", hour: 15, minute: 58 }), { slot: "16", operatingDate: "2026-09-25" });
  assert.deepEqual(slotForPhotoTime({ date: "2026-09-25", hour: 7, minute: 50 }), { slot: "08", operatingDate: "2026-09-25" });
  assert.deepEqual(slotForPhotoTime({ date: "2026-09-25", hour: 23, minute: 55 }), { slot: "24", operatingDate: "2026-09-25" });
  assert.deepEqual(slotForPhotoTime({ date: "2026-10-01", hour: 0, minute: 10 }), { slot: "24", operatingDate: "2026-09-30" });
  assert.equal(slotForPhotoTime({ date: "2026-09-25", hour: 12, minute: 30 }), null);
});

test("cells and previous readings follow the CTKTKT layout (S1 X/Z/AB, S2 AH/AJ/AL, rows 16-27)", () => {
  assert.equal(coalMeterCell("S1-E2", "16"), "Z25");
  assert.equal(coalMeterCell("S2-A1", "08"), "AH16");
  assert.equal(coalMeterCell("S2-F2", "24"), "AL27");
  const previous = { AB25: "75800.10" };
  const current = { X25: "75830.50" };
  assert.equal(previousCoalReading("S1-E2", "08", current, previous), 75800.1);
  assert.equal(previousCoalReading("S1-E2", "16", current, previous), 75830.5);
  assert.equal(previousCoalReading("S1-E2", "24", current, previous), 75830.5);
});

test("an unreadable label is recovered from the meter whose last reading is just below the value", () => {
  const last = { "S1-E2": 75859.24, "S1-A1": 90681.01, "S2-E2": 75000 };
  const previousOf = key => last[key] ?? null;
  assert.deepEqual(matchCoalMeter(75859.247, null, previousOf), { key: "S1-E2", previous: 75859.24, delta: 75859.247 - 75859.24, source: "history" });
  assert.equal(matchCoalMeter(75859.247, "S1-E2", previousOf).source, "label");
  // A label that contradicts the history is overridden and flagged for review.
  const conflict = matchCoalMeter(75859.247, "S1-A1", previousOf);
  assert.equal(conflict.key, "S1-E2");
  const review = reviewCoalReading({ value: 75859.247, match: conflict, label: "S1-A1", slot: "16", photoDate: "2026-09-25", reportDate: "2026-09-25", duplicate: false });
  assert.equal(review.level, "check");
  assert.match(review.reasons.join(" "), /Nhãn đọc được/);
});

test("clean readings pass, while decreases, jumps, other days and duplicates need a check", () => {
  const ok = { key: "S1-E2", previous: 75800, delta: 59.24, source: "label" };
  assert.equal(reviewCoalReading({ value: 75859.24, match: ok, label: "S1-E2", slot: "16", photoDate: "2026-09-25", reportDate: "2026-09-25", duplicate: false }).level, "ok");
  assert.equal(reviewCoalReading({ value: 75859.24, match: ok, label: "S1-E2", slot: "16", photoDate: "2026-09-24", reportDate: "2026-09-25", duplicate: false }).level, "check");
  assert.equal(reviewCoalReading({ value: 75859.24, match: ok, label: "S1-E2", slot: "16", photoDate: null, reportDate: "2026-09-25", duplicate: true }).level, "check");
  const down = { key: "S1-E2", previous: 75900, delta: -40.76, source: "label" };
  assert.match(reviewCoalReading({ value: 75859.24, match: down, label: "S1-E2", slot: "16", photoDate: null, reportDate: "2026-09-25", duplicate: false }).reasons.join(), /nhỏ hơn/);
});

test("EXIF DateTimeOriginal is read from a JPEG header", () => {
  const text = "2026:09:25 15:58:46\0";
  const tiff = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00];
  // IFD0: one entry pointing to the Exif IFD at offset 26.
  const ifd0 = [0x01, 0x00, 0x69, 0x87, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  // Exif IFD: DateTimeOriginal (ASCII, 20 bytes) stored at offset 44.
  const exifIfd = [0x01, 0x00, 0x03, 0x90, 0x02, 0x00, 0x14, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const payload = [...tiff, ...ifd0, ...exifIfd, ...[...text].map(c => c.charCodeAt(0))];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...payload];
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, ((app1.length + 2) >> 8) & 0xff, (app1.length + 2) & 0xff, ...app1, 0xff, 0xd9]);
  assert.deepEqual(readExifTime(bytes.buffer), { date: "2026-09-25", hour: 15, minute: 58 });
  assert.equal(readExifTime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), null);
});

test("AI readings keep the displayed digits and the stamped photo time", async () => {
  const { parseVisionTotal, parseVisionTimestamp } = await import("../../../modules/ctktkt/lib/coal-meter-ocr.ts");
  assert.equal(parseVisionTotal("75859.247"), 75859.247);
  assert.equal(parseVisionTotal("14589,570"), 14589.57);
  assert.equal(parseVisionTotal("7585?.247"), null);
  assert.equal(parseVisionTotal(null), null);
  assert.deepEqual(parseVisionTimestamp("2026-09-25 15:58"), { date: "2026-09-25", hour: 15, minute: 58 });
  assert.equal(parseVisionTimestamp("25 Sep"), null);
});
